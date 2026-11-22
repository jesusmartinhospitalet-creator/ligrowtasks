const test = require('node:test');
const assert = require('node:assert/strict');

function listen(app) {
  return new Promise((resolve) => { const server = app.listen(0, () => resolve(server)); });
}

test('/api/health informa de módulos y configuración sin exponer secretos', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-secreto-de-prueba';
  const app = require('../src/server');
  const server = await listen(app);
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const res = await fetch(base + '/api/health');
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes('secreto'), 'no debe filtrar la clave');
    const body = JSON.parse(text);
    assert.equal(body.ok, true);
    assert.equal(body.modules.assistant, 'ok');
    assert.equal(body.modules.invoicing, 'ok');
    assert.equal(body.assistantConfigured, true);
    // El asistente y la facturación exigen sesión.
    assert.equal((await fetch(base + '/api/assistant/status')).status, 401);
    assert.equal((await fetch(base + '/api/invoicing')).status, 403);
  } finally {
    server.close();
    delete process.env.ANTHROPIC_API_KEY;
  }
});
