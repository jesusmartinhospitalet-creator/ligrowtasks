const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../src/services/assistant.service');
const { assistantTools, toolRisk } = require('../src/services/assistant.tools');

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

const user = { email: 'a@b.c', userId: 'u1' };
const text = (t) => ({ role: 'user', content: [{ type: 'text', text: t }] });
const fakeClient = (reply) => ({ messages: { create: async (params) => { fakeClient.last = params; return reply; } } });
const reply = { content: [{ type: 'text', text: 'hola' }], stop_reason: 'end_turn', usage: { input_tokens: 3, output_tokens: 2 } };

test.beforeEach(() => {
  service.resetRateLimits();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_KEY;
  delete process.env.ANTHROPIC_MODEL;
});

test('las herramientas tienen nombre único, esquema y riesgo', () => {
  const names = assistantTools.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const tool of assistantTools) {
    assert.equal(tool.input_schema.type, 'object');
    assert.ok(['read', 'write', 'confirm'].includes(toolRisk[tool.name]), tool.name);
  }
  // Todo lo que borra exige confirmación.
  for (const name of names.filter((n) => n.startsWith('delete_'))) assert.equal(toolRisk[name], 'confirm', name);
});

test('sin clave de API responde 503 not_configured', async () => {
  const res = fakeRes();
  await service.handleAssistantRequest({ sessionUser: user, body: { messages: [text('hola')] } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'not_configured');
});

test('valida el historial y rechaza peticiones no válidas', async () => {
  const bad = [
    undefined,
    { messages: [] },
    { messages: [{ role: 'system', content: 'x' }] },
    { messages: [{ role: 'user', content: [{ type: 'raro' }] }] },
    { messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'http://x' } }] }] }
  ];
  for (const body of bad) {
    const res = fakeRes();
    await service.handleAssistantRequest({ sessionUser: user, body }, res, { client: fakeClient(reply) });
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
});

test('limita el número de imágenes', async () => {
  const img = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } };
  const res = fakeRes();
  await service.handleAssistantRequest({ sessionUser: user, body: { messages: [{ role: 'user', content: Array(9).fill(img) }] } }, res, { client: fakeClient(reply) });
  assert.equal(res.statusCode, 413);
  assert.equal(res.body.error, 'too_many_images');
});

test('llama al modelo con herramientas, prompt, caché y devuelve el contenido tal cual', async () => {
  const thinking = { type: 'thinking', thinking: 'x', signature: 's' };
  const res = fakeRes();
  const messages = [text('hola'), { role: 'assistant', content: [thinking, { type: 'tool_use', id: 't1', name: 'list_clients', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] }];
  await service.handleAssistantRequest({ sessionUser: user, body: { messages } }, res, { client: fakeClient(reply) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.content, reply.content);
  const sent = fakeClient.last;
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.tools.length, assistantTools.length);
  assert.match(sent.system, /Ligrow Tasks/);
  assert.deepEqual(sent.cache_control, { type: 'ephemeral' });
  assert.deepEqual(sent.messages, messages); // el razonamiento vuelve intacto
});

test('ANTHROPIC_MODEL cambia el modelo', async () => {
  process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5';
  const res = fakeRes();
  await service.handleAssistantRequest({ sessionUser: user, body: { messages: [text('hola')] } }, res, { client: fakeClient(reply) });
  assert.equal(fakeClient.last.model, 'claude-sonnet-5-5');
});

test('límite de 40 peticiones por usuario cada 5 minutos', async () => {
  const now = () => 1_000_000;
  let last;
  for (let i = 0; i < 41; i += 1) {
    last = fakeRes();
    await service.handleAssistantRequest({ sessionUser: user, body: { messages: [text('hola')] } }, last, { client: fakeClient(reply), now });
  }
  assert.equal(last.statusCode, 429);
  // Otro usuario no se ve afectado.
  const other = fakeRes();
  await service.handleAssistantRequest({ sessionUser: { email: 'otro@b.c' }, body: { messages: [text('hola')] } }, other, { client: fakeClient(reply), now });
  assert.equal(other.statusCode, 200);
});

test('traduce los errores del proveedor sin filtrar detalles', async () => {
  const failing = (status) => ({ messages: { create: async () => { const e = new Error('secreto interno'); e.status = status; throw e; } } });
  const cases = [[429, 429, 'rate_limited'], [401, 500, 'provider_auth'], [400, 400, 'provider_rejected'], [529, 503, 'provider_unavailable']];
  for (const [upstream, status, code] of cases) {
    service.resetRateLimits();
    const res = fakeRes();
    await service.handleAssistantRequest({ sessionUser: user, body: { messages: [text('hola')] } }, res, { client: failing(upstream) });
    assert.equal(res.statusCode, status);
    assert.equal(res.body.error, code);
    assert.ok(!JSON.stringify(res.body).includes('secreto'));
  }
});

test('getAssistantStatus refleja si hay clave', () => {
  assert.equal(service.getAssistantStatus().configured, false);
  process.env.ANTHROPIC_KEY = 'k';
  assert.equal(service.getAssistantStatus().configured, true);
  assert.equal(service.getAssistantStatus().risks.delete_task, 'confirm');
});
