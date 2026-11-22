/**
 * Vista previa de un enlace (título, imagen, precio) leyendo su HTML en el servidor.
 *
 * Se hace aquí porque el navegador no puede leer páginas de otros dominios (CORS). Al ser una petición
 * a una URL que elige el usuario/modelo hay que evitar SSRF: solo http(s), solo puertos estándar, sin
 * direcciones privadas o locales (se comprueba al CONECTAR, no solo al resolver, para evitar DNS rebinding),
 * redirecciones limitadas y revalidadas, y límites de tiempo y tamaño.
 */
const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');
const zlib = require('zlib');

const MAX_BYTES = 4_000_000; // algunas fichas de producto pesan >3 MB de HTML
const MAX_IMAGE_BYTES = 700_000;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

/** ¿Es una IP privada, local, de enlace local o reservada? */
function isPrivateIp(ip) {
  const value = String(ip || '').toLowerCase();
  if (net.isIPv4(value)) {
    const [a, b] = value.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(value)) {
    if (value === '::' || value === '::1') return true;
    if (value.startsWith('::ffff:')) return isPrivateIp(value.slice(7));
    return /^f[cd]/.test(value) || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('ff');
  }
  return true; // lo que no sea una IP válida no se acepta
}

/** `lookup` que rechaza direcciones privadas en el momento de conectar. */
function safeLookup(hostname, options, callback) {
  const opts = typeof options === 'function' ? {} : options || {};
  const cb = typeof options === 'function' ? options : callback;
  dns.lookup(hostname, { ...opts, all: true }, (error, addresses) => {
    if (error) return cb(error);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    if (!list.length || list.some((entry) => isPrivateIp(entry.address))) {
      return cb(new Error('Dirección no permitida.'));
    }
    if (opts.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

function parseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch (error) {
    throw new Error('La URL no es válida.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se admiten enlaces http(s).');
  if (url.username || url.password) throw new Error('La URL no puede llevar credenciales.');
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Puerto no permitido.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Dirección no permitida.');
  if (net.isIP(host) && isPrivateIp(host)) throw new Error('Dirección no permitida.');
  return url;
}

function requestOnce(url, { requester, kind = 'html' } = {}) {
  const isImage = kind === 'image';
  const limit = isImage ? MAX_IMAGE_BYTES : MAX_BYTES;
  return new Promise((resolve, reject) => {
    const transport = requester || (url.protocol === 'https:' ? https : http);
    const req = transport.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LigrowTasksBot/1.0; +link-preview)',
          Accept: isImage ? 'image/webp,image/jpeg,image/png,image/gif;q=0.9' : 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br'
        }
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: new URL(res.headers.location, url).toString() });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new Error('La página respondió con el error ' + status + '.'));
        }
        const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        // Muchas tiendas sirven las fotos como application/octet-stream o con un tipo equivocado: se acepta y el
        // formato real se comprueba después con los primeros bytes del archivo.
        if (isImage ? !/^(image\/|application\/(octet-stream|binary)$|binary\/octet-stream$|$)/.test(type) : type && !/html|xml/.test(type)) {
          res.resume();
          return reject(new Error(isImage ? 'El enlace no es una imagen (la web devolvió «' + type + '»).' : 'El enlace no es una página web.'));
        }
        const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
        let stream = res;
        if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        const chunks = [];
        let size = 0;
        stream.on('data', (chunk) => {
          size += chunk.length;
          if (size > limit) {
            req.destroy();
            // De una página basta con lo leído; una imagen incompleta no sirve.
            if (isImage) return reject(new Error('La imagen es demasiado grande.'));
            return resolve({ html: Buffer.concat(chunks).toString('utf8'), url: url.toString() });
          }
          chunks.push(chunk);
        });
        stream.on('end', () => {
          const body = Buffer.concat(chunks);
          if (!isImage) return resolve({ html: body.toString('utf8'), url: url.toString() });
          const real = sniffImageType(body);
          if (!real) return reject(new Error('La imagen está en un formato que el asistente no puede ver (' + (type || 'desconocido') + '). Hacen falta JPG, PNG, WebP o GIF.'));
          resolve({ image: body, mediaType: real, url: url.toString() });
        });
        stream.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new Error('La página tardó demasiado en responder.')));
    req.on('error', reject);
    req.end();
  });
}

async function fetchResource(rawUrl, options = {}) {
  let url = parseUrl(rawUrl);
  for (let hops = 0; hops <= MAX_REDIRECTS; hops += 1) {
    const out = await requestOnce(url, options);
    if (out.redirect) {
      url = parseUrl(out.redirect);
      continue;
    }
    return out;
  }
  throw new Error('Demasiadas redirecciones.');
}

const fetchHtml = (rawUrl, options = {}) => fetchResource(rawUrl, { ...options, kind: 'html' });

// ── Extracción de metadatos ────────────────────────────────────────────────────────────────────────

const decodeEntities = (s) =>
  String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .trim();

/** Valor de una metaetiqueta (property/name) sin depender del orden de los atributos. */
function metaContent(html, keys) {
  const wanted = (Array.isArray(keys) ? keys : [keys]).map((k) => k.toLowerCase());
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const key of wanted) {
    for (const tag of tags) {
      const attrs = {};
      tag.replace(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g, (_, name, __, dq, sq, bare) => {
        attrs[name.toLowerCase()] = dq !== undefined ? dq : sq !== undefined ? sq : bare;
        return '';
      });
      const id = String(attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
      if (id === key && attrs.content) return decodeEntities(attrs.content);
    }
  }
  return '';
}

function jsonLdProduct(html) {
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const type = [].concat(node['@type'] || []).map(String);
    if (type.includes('Product')) found.push(node);
    if (node['@graph']) visit(node['@graph']);
  };
  for (const block of blocks) {
    const body = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
    try { visit(JSON.parse(body)); } catch (error) { /* JSON-LD mal formado: se ignora */ }
  }
  return found[0] || null;
}

const firstImage = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return firstImage(value[0]);
  if (typeof value === 'object') return firstImage(value.url || value.contentUrl);
  return '';
};

function absolute(src, base) {
  if (!String(src || '').trim()) return '';
  try {
    const u = new URL(String(src || '').trim(), base);
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : '';
  } catch (error) {
    return '';
  }
}

// ── Elección de la imagen del producto ─────────────────────────────────────────────────────────────
// Muchas tiendas ponen el LOGO en og:image y las fotos reales dentro del HTML (carruseles, scripts…). Se reúnen
// todas las imágenes posibles y se puntúan: suma lo que parece producto o coincide con lo que se busca, resta
// logos, iconos, menús y banners.

const STOP = new Set(['para', 'con', 'sin', 'los', 'las', 'del', 'una', 'uno', 'por', 'que', 'envio', 'gratis', 'barata', 'barato', 'baratas', 'baratos', 'precio', 'precios', 'comprar', 'online', 'tienda', 'impresion', 'imprimir', 'personalizada', 'personalizado', 'personalizadas', 'personalizados', 'html', 'https', 'http', 'www', 'pedido', 'factura', 'cantidad', 'unidades', 'color', 'colores']);
const stem = (w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
const plain = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Palabras significativas (sin números ni palabras vacías) de textos como la URL, el título o el concepto del pedido. */
function tokensOf(...texts) {
  const out = new Set();
  for (const text of texts) {
    for (const raw of plain(text).split(/[^a-z0-9]+/)) {
      if (raw.length < 4 || /\d/.test(raw) || STOP.has(raw)) continue;
      const t = stem(raw);
      if (!STOP.has(t)) out.add(t);
    }
  }
  return [...out];
}

const BAD_IMAGE = /logo|icon|ico_|picto|sprite|flag|avatar|favicon|placeholder|loader|spacer|pixel|tracking|badge|payment|paypal|visa|mastercard|trustpilot|bandeau|banner|header|footer|arrow|button|rating|star|social|facebook|instagram|twitter|youtube|whatsapp/i;
const MENU_IMAGE = /(^|[\/_.-])(menu|megamenu|nav|thumb|thumbnail|miniatura|mini|small|xs)([\/_.-]|$)/i;
const PRODUCT_PATH = /producto|product|articul|catalog|galer|gallery|zoom|large|principal|main|visuel|visual|photo|foto|packshot|\/p\//i;
const IMG_EXT = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;

function srcsetBest(srcset, base) {
  let best = null;
  for (const part of String(srcset || '').split(',')) {
    const [u, size] = part.trim().split(/\s+/);
    if (!u) continue;
    const w = parseInt(size, 10) || 0;
    if (!best || w >= best.w) best = { u, w };
  }
  return best ? absolute(best.u, base) : '';
}

function attrsOf(tag) {
  const attrs = {};
  tag.replace(/([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g, (_, name, __, dq, sq, bare) => {
    attrs[name.toLowerCase()] = dq !== undefined ? dq : sq !== undefined ? sq : bare;
    return '';
  });
  return attrs;
}

/** Reúne las imágenes posibles de la página con su origen, texto alternativo y orden de aparición. */
function collectImages(html, pageUrl, product) {
  const found = new Map();
  let order = 0;
  const add = (src, info) => {
    const url = absolute(String(src || '').replace(/\\\//g, '/').replace(/&amp;/g, '&'), pageUrl);
    if (!url || !IMG_EXT.test(url) && !info.trusted) return;
    const prev = found.get(url);
    if (prev) { prev.sources.add(info.source); if (!prev.alt && info.alt) prev.alt = info.alt; return; }
    found.set(url, { url, alt: info.alt || '', w: info.w || 0, h: info.h || 0, sources: new Set([info.source]), order: order++ });
  };

  // a) Datos estructurados del producto (lo más fiable)
  if (product) {
    [].concat(product.image || []).forEach((img) => add(firstImage(img), { source: 'jsonld', trusted: true, alt: product.name }));
  }
  // b) Metaetiquetas
  for (const key of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src', 'image']) {
    const v = metaContent(html, key);
    if (v) add(v, { source: 'meta', trusted: true });
  }
  // c) Etiquetas <img> (con atributos de carga diferida y srcset)
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const a = attrsOf(tag);
    const alt = decodeEntities(a.alt || a.title || '').replace(/[\\"]/g, '').trim();
    const w = parseInt(a.width, 10) || 0;
    const h = parseInt(a.height, 10) || 0;
    const set = srcsetBest(a.srcset || a['data-srcset'], pageUrl);
    for (const src of [a['data-zoom-image'], a['data-large'], a['data-full'], a['data-frame'], a['data-original'], a['data-src'], a['data-lazy-src'], set, a.src]) {
      if (src && !/^data:/i.test(src)) add(src, { source: 'img', alt, w, h });
    }
  }
  for (const tag of html.match(/<source\b[^>]*>/gi) || []) {
    const set = srcsetBest(attrsOf(tag).srcset, pageUrl);
    if (set) add(set, { source: 'img' });
  }
  // d) Direcciones de imagen escritas dentro de scripts o JSON (carruseles que se montan con JavaScript)
  const raw = html.match(/https?:(?:\\?\/){2}(?:[^\s"'<>)\\]|\\\/)+?\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>)\\]*)?/gi) || [];
  raw.slice(0, 600).forEach((u) => add(u, { source: 'raw' }));
  return [...found.values()];
}

function scoreImage(img, tokens) {
  const path = plain(decodeURIComponent(img.url.replace(/^https?:\/\/[^/]+/, '')));
  const text = path + ' ' + plain(img.alt);
  let score = 0;
  const matched = tokens.filter((t) => text.includes(t));
  score += matched.length * 10;
  if (PRODUCT_PATH.test(path)) score += 8;
  if (img.sources.has('jsonld')) score += 40;
  if (img.sources.has('meta')) score += 3;
  if (img.alt) score += 1;
  if (BAD_IMAGE.test(path) || BAD_IMAGE.test(plain(img.alt))) score -= 60;
  if (MENU_IMAGE.test(path)) score -= 40;
  if (/\.svg(\?|$)/i.test(path)) score -= 50;
  if (img.w && img.w < 120) score -= 30;
  if (img.h && img.h < 120) score -= 30;
  if (img.sources.size === 1 && img.sources.has('raw') && !matched.length) score -= 10;
  return score;
}

/** Devuelve las imágenes candidatas ordenadas de mejor a peor (a igualdad de puntuación, la que aparece antes). */
function rankImages(html, pageUrl, { hint = '', title = '', product = null } = {}) {
  const slug = (() => { try { return new URL(pageUrl).pathname; } catch (e) { return ''; } })();
  const tokens = tokensOf(slug, title, hint);
  return collectImages(html, pageUrl, product)
    .map((img) => ({ ...img, score: scoreImage(img, tokens) }))
    .filter((img) => img.score > -30)
    .sort((a, b) => b.score - a.score || a.order - b.order);
}

/** Extrae título, imagen, descripción y precio del HTML de una página de producto. */
function extractPreview(html, pageUrl, { hint = '' } = {}) {
  const product = jsonLdProduct(html);
  const offer = product && [].concat(product.offers || [])[0];
  const title = metaContent(html, ['og:title', 'twitter:title']) || (product && product.name) || decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const ranked = rankImages(html, pageUrl, { hint, title, product });
  const price = metaContent(html, ['product:price:amount', 'og:price:amount']) || (offer && (offer.price || (offer.priceSpecification && offer.priceSpecification.price))) || '';
  const currency = metaContent(html, ['product:price:currency', 'og:price:currency']) || (offer && offer.priceCurrency) || '';
  return {
    url: pageUrl,
    title: decodeEntities(title).slice(0, 200),
    description: (metaContent(html, ['og:description', 'description', 'twitter:description']) || '').slice(0, 300),
    image: ranked.length ? ranked[0].url : '',
    candidates: ranked.slice(0, 8).map((c) => ({ url: c.url, alt: c.alt.slice(0, 120), score: c.score })),
    price: price ? String(price) : '',
    currency: currency ? String(currency) : '',
    site: metaContent(html, ['og:site_name']) || new URL(pageUrl).hostname.replace(/^www\./, '')
  };
}

/** Formato real de una imagen según sus primeros bytes ('' si no es JPG, PNG, GIF o WebP). */
function sniffImageType(buf) {
  if (!buf || buf.length < 12) return '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return '';
}

/** Descarga una imagen (con las mismas protecciones) para poder mostrársela al asistente. */
async function fetchImage(rawUrl, options = {}) {
  const out = await fetchResource(rawUrl, { ...options, kind: 'image' });
  return { mediaType: out.mediaType, base64: out.image.toString('base64'), bytes: out.image.length, url: out.url };
}

/**
 * Vista previa de una página de producto. Intenta las mejores imágenes por orden hasta encontrar una que se pueda
 * descargar (así se descarta una URL rota o con protección anti-hotlink) y devuelve sus datos para que el asistente
 * la vea. Con `imageUrl` se usa esa imagen en lugar de elegir.
 */
async function getLinkPreview(rawUrl, { hint = '', imageUrl = '', withImageData = true, requester } = {}) {
  const { html, url } = await fetchHtml(rawUrl, { requester });
  const preview = extractPreview(html, url, { hint });
  if (!withImageData) return preview;
  const tries = imageUrl ? [imageUrl] : preview.candidates.map((c) => c.url).slice(0, 4);
  for (const candidate of tries) {
    try {
      const data = await fetchImage(candidate, { requester });
      preview.image = data.url;
      preview.imageData = { mediaType: data.mediaType, base64: data.base64, bytes: data.bytes };
      return preview;
    } catch (error) {
      if (imageUrl) { preview.image = ''; preview.imageError = error.message; return preview; }
    }
  }
  if (!imageUrl && tries.length) preview.imageError = 'No se pudo descargar ninguna de las imágenes candidatas.';
  return preview;
}

module.exports = { sniffImageType, getLinkPreview, extractPreview, rankImages, fetchImage, isPrivateIp, parseUrl, metaContent, safeLookup, tokensOf };
