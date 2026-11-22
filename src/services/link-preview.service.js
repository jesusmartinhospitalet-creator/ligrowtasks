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

const MAX_BYTES = 1_500_000;
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

function requestOnce(url, { requester } = {}) {
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
          Accept: 'text/html,application/xhtml+xml',
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
        const type = String(res.headers['content-type'] || '');
        if (type && !/html|xml/i.test(type)) {
          res.resume();
          return reject(new Error('El enlace no es una página web.'));
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
          if (size > MAX_BYTES) {
            // Con lo leído hasta aquí basta: las metaetiquetas están en la cabecera.
            req.destroy();
            return resolve({ html: Buffer.concat(chunks).toString('utf8'), url: url.toString() });
          }
          chunks.push(chunk);
        });
        stream.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), url: url.toString() }));
        stream.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new Error('La página tardó demasiado en responder.')));
    req.on('error', reject);
    req.end();
  });
}

async function fetchHtml(rawUrl, options = {}) {
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

/** Extrae título, imagen, descripción y precio del HTML de una página de producto. */
function extractPreview(html, pageUrl) {
  const product = jsonLdProduct(html);
  const offer = product && [].concat(product.offers || [])[0];
  const title = metaContent(html, ['og:title', 'twitter:title']) || (product && product.name) || decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const image =
    absolute(metaContent(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']), pageUrl) ||
    absolute(firstImage(product && product.image), pageUrl) ||
    absolute(metaContent(html, ['image']), pageUrl);
  const price = metaContent(html, ['product:price:amount', 'og:price:amount']) || (offer && (offer.price || (offer.priceSpecification && offer.priceSpecification.price))) || '';
  const currency = metaContent(html, ['product:price:currency', 'og:price:currency']) || (offer && offer.priceCurrency) || '';
  return {
    url: pageUrl,
    title: decodeEntities(title).slice(0, 200),
    description: (metaContent(html, ['og:description', 'description', 'twitter:description']) || '').slice(0, 300),
    image,
    price: price ? String(price) : '',
    currency: currency ? String(currency) : '',
    site: metaContent(html, ['og:site_name']) || new URL(pageUrl).hostname.replace(/^www\./, '')
  };
}

async function getLinkPreview(rawUrl, options) {
  const { html, url } = await fetchHtml(rawUrl, options);
  return extractPreview(html, url);
}

module.exports = { getLinkPreview, extractPreview, isPrivateIp, parseUrl, metaContent, safeLookup };
