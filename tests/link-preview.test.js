const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateIp, parseUrl, extractPreview, getLinkPreview } = require('../src/services/link-preview.service');

test('bloquea direcciones privadas, locales y reservadas', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '172.31.255.255', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1']) {
    assert.ok(isPrivateIp(ip), ip);
  }
  for (const ip of ['8.8.8.8', '151.101.1.69', '172.32.0.1', '2606:4700:4700::1111']) assert.ok(!isPrivateIp(ip), ip);
});

test('parseUrl solo admite http(s) públicos en puertos estándar', () => {
  for (const bad of ['ftp://x.com', 'file:///etc/passwd', 'javascript:alert(1)', 'http://localhost/x', 'http://127.0.0.1/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://user:pass@x.com/', 'http://x.com:8080/', 'http://api.internal/', 'no es una url']) {
    assert.throws(() => parseUrl(bad), bad);
  }
  assert.equal(parseUrl('https://www.vistaprint.es/tarjetas').hostname, 'www.vistaprint.es');
});

test('getLinkPreview rechaza destinos internos sin conectar', async () => {
  await assert.rejects(getLinkPreview('http://127.0.0.1:80/'), /no permitida/i);
  await assert.rejects(getLinkPreview('http://localhost/'), /no permitida/i);
});

test('extrae título, imagen y precio de Open Graph (en cualquier orden de atributos)', () => {
  const html = `<html><head><title>Fallback</title>
    <meta content="Tarjetas de visita &amp; más" property="og:title">
    <meta property='og:image' content='/img/tarjetas.jpg'>
    <meta name="description" content="Imprime tarjetas">
    <meta property="product:price:amount" content="19.90"><meta property="product:price:currency" content="EUR">
    <meta property="og:site_name" content="Vistaprint"></head></html>`;
  const p = extractPreview(html, 'https://www.vistaprint.es/tarjetas/visita');
  assert.equal(p.title, 'Tarjetas de visita & más');
  assert.equal(p.image, 'https://www.vistaprint.es/img/tarjetas.jpg');
  assert.equal(p.price, '19.90');
  assert.equal(p.currency, 'EUR');
  assert.equal(p.site, 'Vistaprint');
});

test('usa JSON-LD Product si no hay Open Graph y descarta imágenes no http', () => {
  const ld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'Product', name: 'Roll-up 85x200', image: ['https://cdn.x.com/r.jpg'], offers: { price: '45', priceCurrency: 'EUR' } }] };
  const html = '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>';
  const p = extractPreview(html, 'https://x.com/p');
  assert.equal(p.title, 'Roll-up 85x200');
  assert.equal(p.image, 'https://cdn.x.com/r.jpg');
  assert.equal(p.price, '45');
  const bad = extractPreview('<meta property="og:image" content="javascript:alert(1)">', 'https://x.com/p');
  assert.equal(bad.image, '');
});

// ── Elección de la imagen del producto (caso real: la web pone el LOGO en og:image) ─────────────────────
const { rankImages, fetchImage, tokensOf } = require('../src/services/link-preview.service');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');

const SHOP = `<html><head><title>Impresión Tarjetas de Visita Baratas - Envío Gratis</title>
<meta property="og:title" content=""><meta property="og:image" content="https://www.tienda.es/site/charte/images/tb/logo-tienda-es.jpg">
<link rel="icon" href="/favicon.png"></head><body>
<img src="/site/charte/images/tb/logo-tienda-es.svg" alt="Tienda.es">
<img src="https://www.tienda.es/site/charte/images/tb/flag_es.png"><img src="/login/google_icon.svg">
<div class="menu"><img loading="lazy" src="https://media.tienda.es/imagen-menu/tarjeta-visita-menu/tarjeta-visita-mate.webp" alt="Tarjeta" width="150" height="150">
<img src="https://media.tienda.es/imagen-menu/tarjeta-visita-menu/tarjeta-visita-cuadrado.webp" width="150" height="150">
<img src="https://media.tienda.es/img_menu/impresion_calendario_adviento_menu.webp"><img src="https://media.tienda.es/banner-homepage/lona/loona.jpg"></div>
<script>var visuel=new Array("<li><img data-frame='https://media.tienda.es/imagen-producto/tarjeta-de-visita/impresion_tarjeta_visita_vertical_personalizada.webp' src='https://media.tienda.es/imagen-producto/tarjeta-de-visita/impresion_tarjeta_visita_vertical_personalizada.webp' alt=\\"Impresión de tarjetas de visita en formato vertical\\" /></li>");</script>
<img src="https://media.tienda.es/imagen-producto/tarjeta-de-visita/impresion_tarjeta_visita_apaisada_personalizada.webp" alt="Tarjeta de Visita Clásica">
<script>var o={"img":"https:\\/\\/media.tienda.es\\/imagen-producto\\/tarjeta-de-visita\\/zoom-laminado.jpg"}</script>
</body></html>`;
const SHOP_URL = 'https://www.tienda.es/tarjetas-visita-baratas-r2815.html';

test('descarta el logo de og:image, iconos, menús y banners y elige la foto del producto', () => {
  const ranked = rankImages(SHOP, SHOP_URL, { hint: '1000 tarjetas de visita 8,5 x 5,5 cm' });
  assert.match(ranked[0].url, /imagen-producto\/tarjeta-de-visita\//);
  for (const bad of ['logo', 'flag', 'google_icon', 'imagen-menu', 'img_menu', 'banner-homepage', 'favicon']) {
    assert.ok(!ranked.some((r) => r.url.includes(bad) && r.score > ranked[0].score - 20), bad + ' no debe competir');
  }
  assert.equal(extractPreview(SHOP, SHOP_URL, { hint: 'tarjetas de visita' }).image, ranked[0].url);
  assert.ok(!/logo/.test(extractPreview(SHOP, SHOP_URL).image));
});

test('encuentra imágenes dentro de scripts (JSON con barras escapadas) y limpia el texto alternativo', () => {
  const ranked = rankImages(SHOP, SHOP_URL, { hint: 'tarjetas' });
  assert.ok(ranked.some((r) => r.url === 'https://media.tienda.es/imagen-producto/tarjeta-de-visita/zoom-laminado.jpg'));
  const vertical = ranked.find((r) => r.url.includes('vertical'));
  assert.ok(vertical && !/[\\"]/.test(vertical.alt), 'alt sin comillas escapadas: ' + vertical.alt);
});

test('si lo único que hay es el logo, no se inventa otra imagen mejor (queda como último recurso)', () => {
  const html = '<meta property="og:image" content="https://x.com/logo.jpg"><title>Ficha</title>';
  const p = extractPreview(html, 'https://x.com/p');
  assert.ok(p.candidates.every((c) => c.score < 0) || p.image === '' || /logo/.test(p.image));
});

test('palabras clave: ignora números, palabras vacías y plurales', () => {
  assert.deepEqual(tokensOf('/tarjetas-visita-baratas-r2815.html', '1000 tarjetas de visita 8,5 x 5,5 cm (350 g)').sort(), ['tarjeta', 'visita']);
});

/** Transporte HTTP falso para probar la descarga sin red. */
function fakeTransport(routes) {
  return {
    request(url, options, cb) {
      const req = new EventEmitter();
      req.destroy = () => {};
      req.end = () => {
        const r = routes[url.toString()] || { status: 404, type: 'text/plain', body: 'no' };
        const res = Readable.from([Buffer.isBuffer(r.body) ? r.body : Buffer.from(String(r.body))]);
        res.statusCode = r.status || 200;
        res.headers = { 'content-type': r.type || 'text/html', ...(r.headers || {}) };
        cb(res);
      };
      return req;
    }
  };
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('getLinkPreview descarga la imagen elegida y la devuelve para que el asistente la vea', async () => {
  const best = 'https://media.tienda.es/imagen-producto/tarjeta-de-visita/impresion_tarjeta_visita_apaisada_personalizada.webp';
  const requester = fakeTransport({ [SHOP_URL]: { body: SHOP }, [best]: { type: 'image/webp', body: PNG } });
  const p = await getLinkPreview(SHOP_URL, { hint: 'tarjetas de visita', requester });
  assert.equal(p.image, best);
  assert.equal(p.imageData.mediaType, 'image/webp');
  assert.equal(Buffer.from(p.imageData.base64, 'base64').length, PNG.length);
});

test('si la mejor imagen no se puede descargar, prueba con la siguiente', async () => {
  const ranked = rankImages(SHOP, SHOP_URL, { hint: 'tarjetas de visita' });
  const requester = fakeTransport({ [SHOP_URL]: { body: SHOP }, [ranked[1].url]: { type: 'image/png', body: PNG } }); // la primera da 404
  const p = await getLinkPreview(SHOP_URL, { hint: 'tarjetas de visita', requester });
  assert.equal(p.image, ranked[1].url);
});

test('con image_url usa esa imagen y avisa si no sirve', async () => {
  const chosen = 'https://media.tienda.es/imagen-producto/tarjeta-de-visita/zoom-laminado.jpg';
  const requester = fakeTransport({ [SHOP_URL]: { body: SHOP }, [chosen]: { type: 'image/jpeg', body: PNG } });
  assert.equal((await getLinkPreview(SHOP_URL, { imageUrl: chosen, requester })).image, chosen);
  const broken = await getLinkPreview(SHOP_URL, { imageUrl: 'https://media.tienda.es/no-existe.jpg', requester });
  assert.equal(broken.image, '');
  assert.ok(broken.imageError);
});

test('fetchImage rechaza lo que no es una imagen compatible o es demasiado grande', async () => {
  const url = 'https://media.tienda.es/x.png';
  await assert.rejects(fetchImage(url, { requester: fakeTransport({ [url]: { type: 'text/html', body: '<html>' } }) }), /no es una imagen/);
  await assert.rejects(fetchImage(url, { requester: fakeTransport({ [url]: { type: 'image/svg+xml', body: '<svg/>' } }) }), /no es una imagen/);
  await assert.rejects(fetchImage(url, { requester: fakeTransport({ [url]: { type: 'image/png', body: Buffer.alloc(800_000) } }) }), /demasiado grande/);
  await assert.rejects(fetchImage('http://127.0.0.1/x.png'), /no permitida/i);
});
