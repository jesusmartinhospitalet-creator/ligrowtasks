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
