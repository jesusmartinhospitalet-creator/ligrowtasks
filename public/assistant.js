/* Ligrow Tasks · Asistente de IA · panel y bucle de conversación
 *
 *   Navegador (panel)                 Servidor                       Anthropic
 *   bucle de herramientas  ── POST /api/assistant ──►  sesión + límites ──► Messages API
 *   (assistant-tools.js)   ◄── content + stop_reason ──────────────────────┘
 *
 * El modelo corre en el servidor (la clave nunca llega al navegador). Cada herramienta que pide el modelo se
 * ejecuta aquí con las mismas funciones que usan los botones de la app. Un mensaje del usuario puede dar varias
 * vueltas (modelo → herramientas → modelo), hasta MAX_ROUNDS.
 */
(function () {
  'use strict';
  if (window.LigrowAI) return;

  const MAX_ROUNDS = 12;
  const BULK_LIMIT = 5; // a partir de este número de cambios en un turno, la app pide permiso para seguir
  const MAX_HISTORY_CHARS = 3400000;
  const MAX_IMAGES = 8;
  const MAX_DOCS = 4;
  const MAX_PDF_B64 = 2000000; // ~1,4 MB de PDF
  const MAX_SIDE = 1568;
  const MAX_B64 = 900000;

  const T = () => window.LigrowAITools;
  const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v));
  let counter = 0;
  const uid = () => Date.now().toString(36) + '-' + (counter += 1);

  // ── Iconos ───────────────────────────────────────────────────────────────────────────────────────
  const ICON = {
    sparkles: '<path d="M9.94 14.06 8.5 18.5l-1.44-4.44a2 2 0 0 0-1.27-1.27L1.5 11.5l4.29-1.29a2 2 0 0 0 1.27-1.27L8.5 4.5l1.44 4.44a2 2 0 0 0 1.27 1.27l4.29 1.29-4.29 1.29a2 2 0 0 0-1.27 1.27zM18.5 3v4M16.5 5h4M18.5 17v4M16.5 19h4"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    volumeOff: '<path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21M19 3v6M16 6h6"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
    micOff: '<path d="m2 2 20 20M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7M19 11a7 7 0 0 1-.9 3.4M5 11a7 7 0 0 0 11.4 5.4M12 18v4"/>',
    send: '<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',
    square: '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    slash: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/>'
  };
  const svg = (name, extra) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' + (extra || '') + '>' + (ICON[name] || '') + '</svg>';

  // ── Estado ────────────────────────────────────────────────────────────────────────────────────────
  const A = {
    open: false,
    items: [],
    busy: false,
    configured: true,
    risks: null,
    readAloud: false,
    autoSend: true,
    images: [],
    interim: '',
    error: '',
    listening: false,
    dragging: false,
    userKey: ''
  };
  // Historial que se envía al modelo: solo se le añaden mensajes (nunca se editan los anteriores).
  let history = [];
  let historyChars = 0;
  let imagesInHistory = 0;
  let docsInHistory = 0;
  let attachCounter = 0;
  let runtime = { undoStack: [] };
  const confirmResolvers = new Map();
  let abortCtl = null;
  let spokenCount = 0;
  let root = null;

  const addHistory = (msg) => { history.push(msg); historyChars += JSON.stringify(msg).length; };
  const push = (item) => { A.items.push(item); paintList(); };
  const patch = (id, changes) => { const it = A.items.find((x) => x.id === id); if (it) Object.assign(it, changes); paintList(); };

  // ── Estado del servidor (¿hay clave? ¿qué riesgo tiene cada herramienta?) ─────────────────────────────────
  let statusPromise = null;
  function loadStatus() {
    if (A.risks) return Promise.resolve(true);
    if (!statusPromise) {
      statusPromise = fetch('/api/assistant/status', { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => { A.configured = !!d.configured; A.risks = d.risks || null; paintWarn(); return !!A.risks; })
        .catch(() => { statusPromise = null; return false; });
    }
    return statusPromise;
  }

  // ── Contexto que acompaña a cada mensaje ───────────────────────────────────────────────────────────────────
  function messageContext() {
    const now = new Date();
    const iso = T().todayISO();
    const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(now);
    let visible = '';
    try {
      const snap = T().currentSnapshot();
      const lean = { client: snap.client && { id: snap.client.id, name: snap.client.name }, tab: snap.tab, kanban_owner_filter: snap.kanban_owner_filter, orders_filters: snap.orders_filters, open_task: snap.open_task && { code: snap.open_task.code, title: snap.open_task.title, client: snap.open_task.client } };
      const json = JSON.stringify(lean);
      visible = json === '{}' ? '' : '; en pantalla: ' + (json.length > 1800 ? json.slice(0, 1800) + '…' : json);
    } catch (e) { /* sin contexto adicional */ }
    return '[Contexto de la app — fecha real: ' + iso + ' (' + weekday + '); usuario: ' + ((S.currentUser && S.currentUser.name) || 'Usuario') + '; pantalla actual: ' + T().describeScreen() + visible + ']';
  }

  const limitText = (value, max) => (value.length > (max || 20000) ? value.slice(0, max || 20000) + '… [recortado]' : value);

  // ── Llamada al modelo ───────────────────────────────────────────────────────────────────────────────────────────
  async function callModel(signal) {
    let response;
    try {
      response = await fetch('/api/assistant', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }), signal });
    } catch (error) {
      if (error && error.name === 'AbortError') return { error: 'Detenido.', code: 'aborted' };
      return { error: 'No se ha podido conectar con el servidor.', code: 'network' };
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || !Array.isArray(body.content)) {
      if (response.status === 401) return { error: 'Tu sesión ha caducado. Vuelve a iniciar sesión para usar el asistente.', code: 'unauthorized' };
      return { error: (body && body.message) || 'El asistente no ha podido responder.', code: (body && body.error) || String(response.status) };
    }
    return body;
  }

  // ── Ejecución de herramientas ─────────────────────────────────────────────────────────────────────────────────────
  function askConfirmation(text) {
    return new Promise((resolve) => {
      const id = uid();
      confirmResolvers.set(id, resolve);
      push({ kind: 'confirm', id, text, state: 'pending' });
    });
  }

  function answerConfirmation(id, approved) {
    const resolve = confirmResolvers.get(id);
    if (!resolve) return;
    confirmResolvers.delete(id);
    patch(id, { state: approved ? 'approved' : 'declined' });
    resolve(approved);
  }

  function syncUndone() {
    const undone = new Set(runtime.undoStack.filter((e) => e.undone).map((e) => e.id));
    A.items.forEach((it) => { if (it.kind === 'action' && it.undoId && undone.has(it.undoId) && it.status === 'done') it.status = 'undone'; });
    paintList();
  }

  async function executeTool(block, turn) {
    const risk = A.risks && A.risks[block.name];
    const input = block.input || {};
    const result = (payload, isError, extra) => ({ type: 'tool_result', tool_use_id: block.id, content: extra && extra.length ? [{ type: 'text', text: limitText(JSON.stringify(payload)) }, ...extra] : limitText(JSON.stringify(payload)), ...(isError ? { is_error: true } : {}) });
    if (!risk) return result({ error: 'Herramienta desconocida: ' + block.name + '.' }, true);

    const bulk = risk === 'write' && turn.mutations >= BULK_LIMIT;
    if (risk === 'confirm' || bulk) {
      const description = T().describeConfirmation(block.name, input) || (bulk ? 'Ya se han hecho ' + turn.mutations + ' cambios seguidos. ¿Permites que continúe con «' + block.name + '»?' : '¿Permites ejecutar «' + block.name + '»?');
      const approved = await askConfirmation(description);
      if (!approved) {
        push({ kind: 'action', id: uid(), label: description, status: 'declined', irreversible: false });
        return result({ declined: true, message: 'El usuario ha rechazado esta acción. No la repitas; pregunta qué prefiere.' });
      }
    }

    const outcome = await T().runTool(block.name, input, runtime);
    if (block.name === 'undo_last_actions') syncUndone();

    if (outcome.mutated || outcome.isError) {
      const failedMessage = outcome.isError ? (outcome.result && outcome.result.error) || 'Error' : undefined;
      let undoId;
      if (outcome.undo) {
        const entry = { id: uid(), label: outcome.undo.label, run: outcome.undo.run, undone: false };
        runtime.undoStack.push(entry);
        undoId = entry.id;
      }
      if (block.name !== 'undo_last_actions' || outcome.isError) {
        push({ kind: 'action', id: uid(), label: outcome.summary || block.name, status: outcome.isError ? 'failed' : 'done', undoId, irreversible: !outcome.isError && !outcome.undo, error: failedMessage });
      }
      if (outcome.mutated) turn.mutations += 1;
    }
    return result(outcome.result, !!outcome.isError, outcome.content);
  }

  // ── Conversación ──────────────────────────────────────────────────────────────────────────────────────────────────
  async function send(rawText, images) {
    const text = (rawText || '').trim();
    images = images || [];
    if (A.busy || (!text && !images.length)) return;
    const nDocs = images.filter((a) => a.kind === 'pdf').length;
    const nImgs = images.length - nDocs;
    if (historyChars > MAX_HISTORY_CHARS || imagesInHistory + nImgs > MAX_IMAGES || docsInHistory + nDocs > MAX_DOCS) {
      push({ kind: 'notice', id: uid(), text: 'La conversación ya es muy larga o lleva demasiadas imágenes. Pulsa «Nueva conversación» para seguir.' });
      return;
    }
    if (!(await loadStatus())) {
      push({ kind: 'notice', id: uid(), text: 'No se ha podido conectar con el servidor del asistente. Comprueba tu conexión y que has iniciado sesión.' });
      return;
    }
    if (!A.configured) { paintWarn(); return; }

    A.busy = true;
    paintBusy();
    abortCtl = new AbortController();
    const controller = abortCtl;
    push({ kind: 'user', id: uid(), text, images: images.filter((a) => a.kind !== 'pdf').map((i) => i.dataUrl), files: images.filter((a) => a.kind === 'pdf').map((a) => a.name) });

    // Cada adjunto recibe un identificador (adjunto_1…) que el modelo puede usar en las herramientas.
    const refs = images.map((a) => {
      attachCounter += 1;
      const ref = 'adjunto_' + attachCounter;
      T().attachments.set(ref, { ref, name: a.name || (a.kind === 'pdf' ? 'documento.pdf' : 'imagen.jpg'), mediaType: a.mediaType, base64: a.base64, size: a.size });
      return ref + ' = ' + (a.name || ref) + ' (' + (a.kind === 'pdf' ? 'PDF' : 'imagen') + ')';
    });
    const content = images.map((a) => (a.kind === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 }, title: a.name }
      : { type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.base64 } }));
    content.push({ type: 'text', text: messageContext() + (refs.length ? '\n[Adjuntos de este mensaje: ' + refs.join('; ') + ']' : '') + '\n\n' + (text || 'Mira el archivo adjunto.') });
    const baseLength = history.length;
    const baseChars = historyChars;
    addHistory({ role: 'user', content });
    imagesInHistory += nImgs;
    docsInHistory += nDocs;

    const turn = { mutations: 0 };
    try {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const reply = await callModel(controller.signal);
        if (reply.error) {
          if (reply.code === 'not_configured') { A.configured = false; paintWarn(); }
          push({ kind: 'notice', id: uid(), text: reply.code === 'aborted' ? 'He detenido la respuesta.' : reply.error });
          // Si ni siquiera hubo respuesta a este mensaje, se retira para que el historial siga siendo válido.
          if (round === 0) { history.length = baseLength; historyChars = baseChars; imagesInHistory -= nImgs; docsInHistory -= nDocs; }
          return;
        }
        // Los bloques se devuelven al modelo tal cual llegaron (incluido el razonamiento).
        if (reply.content.length) addHistory({ role: 'assistant', content: reply.content });
        const spoken = reply.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        if (spoken) push({ kind: 'assistant', id: uid(), text: spoken });
        reply.content.filter((b) => b.type === 'server_tool_use' && b.name === 'web_search').forEach((b) => push({ kind: 'notice', id: uid(), text: 'Buscando en la web: «' + String((b.input && b.input.query) || '') + '»' }));

        if (reply.stop_reason === 'refusal') { push({ kind: 'notice', id: uid(), text: 'El modelo no ha podido ayudar con esa petición. Prueba a formularla de otra manera.' }); return; }
        if (reply.stop_reason === 'max_tokens') push({ kind: 'notice', id: uid(), text: 'La respuesta se ha cortado por longitud. Pídeme que continúe.' });

        const calls = reply.content.filter((b) => b.type === 'tool_use');
        // Una búsqueda web larga pausa el turno: se reenvía el historial tal cual para que continúe.
        if (reply.stop_reason === 'pause_turn') continue;
        if (reply.stop_reason !== 'tool_use' || !calls.length) return;

        const results = [];
        for (const call of calls) {
          if (controller.signal.aborted) results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify({ error: 'Detenido por el usuario.' }), is_error: true });
          else results.push(await executeTool(call, turn));
        }
        addHistory({ role: 'user', content: results });
        if (controller.signal.aborted) { push({ kind: 'notice', id: uid(), text: 'He detenido la respuesta.' }); return; }
      }
      push({ kind: 'notice', id: uid(), text: 'Me he quedado sin pasos para esta petición. Dime si quieres que continúe.' });
    } finally {
      A.busy = false;
      abortCtl = null;
      paintBusy();
    }
  }

  function stop() {
    if (abortCtl) abortCtl.abort();
    // Una confirmación pendiente se da por rechazada para liberar el bucle.
    for (const [id, resolve] of [...confirmResolvers]) {
      confirmResolvers.delete(id);
      resolve(false);
      patch(id, { state: 'declined' });
    }
  }

  function reset() {
    stop();
    history = [];
    historyChars = 0;
    imagesInHistory = 0;
    docsInHistory = 0;
    attachCounter = 0;
    if (T()) T().attachments.clear();
    runtime = { undoStack: [] };
    spokenCount = 0;
    A.items = [];
    A.images = [];
    A.error = '';
    paintAll();
  }

  async function undoAction(itemId) {
    const item = A.items.find((x) => x.id === itemId);
    if (!item || item.kind !== 'action' || !item.undoId) return;
    const entry = runtime.undoStack.find((x) => x.id === item.undoId);
    if (!entry || entry.undone) return;
    let res;
    try { res = await entry.run(); } catch (e) { res = { ok: false, message: 'No se ha podido deshacer esa acción.' }; }
    if (res && res.ok) {
      entry.undone = true;
      syncUndone();
      // El modelo debe saberlo: se le avisa en el siguiente mensaje de forma transparente.
      addHistory({ role: 'user', content: [{ type: 'text', text: '[La app deshizo por petición del usuario: ' + entry.label + ']' }] });
    } else {
      push({ kind: 'notice', id: uid(), text: (res && res.message) || 'No se ha podido deshacer esa acción.' });
    }
  }

  // ── Imágenes ───────────────────────────────────────────────────────────────────────────────────────────────────────
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se ha podido leer la imagen.')); };
      img.src = url;
    });
  }

  /** Reduce y comprime la imagen en el navegador: nunca se sube el original ni se guarda en la app. */
  function readAsBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => { const url = String(r.result); resolve(url.slice(url.indexOf(',') + 1)); };
      r.onerror = () => reject(new Error('No se ha podido leer el archivo.'));
      r.readAsDataURL(file);
    });
  }

  async function fileToAttachment(file) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (isPdf) {
      const base64 = await readAsBase64(file);
      if (base64.length > MAX_PDF_B64) throw new Error('El PDF «' + file.name + '» es demasiado grande (máximo ~1,4 MB). Prueba a comprimirlo o a adjuntar una foto.');
      return { id: uid(), kind: 'pdf', name: file.name || 'documento.pdf', size: file.size, dataUrl: '', base64, mediaType: 'application/pdf' };
    }
    if (!file.type.startsWith('image/')) throw new Error('Solo se pueden adjuntar imágenes o PDF.');
    const image = await loadImage(file);
    let side = MAX_SIDE;
    let quality = 0.82;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Este navegador no puede procesar imágenes.');
      ctx.fillStyle = '#ffffff'; // los PNG con transparencia pasan a JPEG sobre blanco
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      if (base64.length <= MAX_B64) return { id: uid(), kind: 'image', name: (file.name || 'imagen').replace(/\.[^.]+$/, '') + '.jpg', size: Math.round(base64.length * 0.75), dataUrl, base64, mediaType: 'image/jpeg' };
      side = Math.round(side * 0.75);
      quality = Math.max(0.5, quality - 0.1);
    }
    throw new Error('La imagen es demasiado grande incluso reducida.');
  }

  async function addFiles(files) {
    A.error = '';
    for (const file of files.filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''))) {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
      const pdfs = A.images.filter((a) => a.kind === 'pdf').length;
      if (isPdf ? docsInHistory + pdfs >= MAX_DOCS : imagesInHistory + (A.images.length - pdfs) >= MAX_IMAGES) { A.error = 'Máximo de archivos por conversación alcanzado. Empieza una conversación nueva.'; break; }
      try { A.images.push(await fileToAttachment(file)); } catch (e) { A.error = e && e.message ? e.message : 'No se ha podido adjuntar la imagen.'; }
    }
    paintFoot();
  }

  // ── Voz ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const voiceErrors = {
    'not-allowed': 'El navegador no tiene permiso para usar el micrófono.',
    'service-not-allowed': 'El navegador no permite el dictado en este momento.',
    'no-speech': 'No he oído nada. Inténtalo de nuevo.',
    'audio-capture': 'No se detecta ningún micrófono.',
    network: 'El dictado necesita conexión a internet.'
  };
  let recognition = null;

  function startVoice() {
    if (!Recognition || recognition) return;
    A.error = '';
    const r = new Recognition();
    r.lang = 'es-ES';
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        const tr = (res[0] && res[0].transcript) || '';
        if (res.isFinal) final += tr; else interim += tr;
      }
      if (interim) { A.interim = interim; paintFoot(); }
      if (final.trim()) {
        A.interim = '';
        const ta = root && root.querySelector('.ai-box textarea');
        if (A.autoSend) submit(final.trim());
        else if (ta) { ta.value += (ta.value ? ' ' : '') + final.trim(); autoGrow(ta); paintFoot(); }
      }
    };
    r.onerror = (event) => { A.error = voiceErrors[event.error] || 'No se ha podido dictar.'; paintFoot(); };
    r.onend = () => { recognition = null; A.listening = false; paintFoot(); };
    recognition = r;
    A.listening = true;
    paintFoot();
    try { r.start(); } catch (e) { recognition = null; A.listening = false; paintFoot(); }
  }
  const stopVoice = () => { if (recognition) recognition.stop(); };

  const canSpeak = () => 'speechSynthesis' in window;
  function speak(text) {
    if (!canSpeak()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    window.speechSynthesis.speak(u);
  }
  const stopSpeaking = () => { if (canSpeak()) window.speechSynthesis.cancel(); };

  // ── Interfaz ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const SUGGESTIONS = [
    '¿Cómo estamos hoy?',
    '¿Qué tareas están vencidas?',
    'Crea una tarea «Revisar textos» para el viernes',
    'Crea una factura de hoy de 100 tarjetas, total 30 €',
    'Registra la factura de proveedor que te adjunto',
    '¿Cuánto tenemos pendiente de cobrar y de pagar?'
  ];

  const richText = (text) =>
    esc(text).split('\n').map((line) => '<p>' + line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</p>').join('');

  function itemHtml(it) {
    switch (it.kind) {
      case 'user':
        return '<li class="ai-user">' +
          (it.images.length ? '<div class="ai-user-imgs">' + it.images.map((src, i) => '<img alt="Imagen adjunta ' + (i + 1) + '" src="' + src + '">').join('') + '</div>' : '') +
          ((it.files && it.files.length) ? '<div class="ai-user-imgs">' + it.files.map((n) => '<span class="ai-pdfchip">' + svg('file') + esc(n) + '</span>').join('') + '</div>' : '') +
          (it.text ? '<p class="ai-bubble-user">' + esc(it.text) + '</p>' : '') + '</li>';
      case 'assistant':
        return '<li class="ai-bubble-ai">' + richText(it.text) + '</li>';
      case 'action': {
        const ico = it.status === 'failed' ? svg('alert') : it.status === 'done' ? svg('check') : svg('slash');
        return '<li class="ai-action ' + it.status + '"><span class="ai-action-ico">' + ico + '</span><div class="ai-action-main"><p class="ai-action-label">' + esc(it.label) + '</p>' +
          (it.status === 'failed' ? '<p class="ai-action-note">' + esc(it.error) + '</p>' : '') +
          (it.status === 'undone' ? '<p class="ai-action-note">Deshecho</p>' : '') +
          (it.status === 'declined' ? '<p class="ai-action-note">Rechazado</p>' : '') +
          (it.status === 'done' && it.irreversible ? '<p class="ai-action-note">No se puede deshacer</p>' : '') +
          '</div>' +
          (it.status === 'done' && it.undoId ? '<button class="ai-undo" type="button" data-undo="' + it.id + '">' + svg('undo') + 'Deshacer</button>' : '') + '</li>';
      }
      case 'confirm':
        return '<li class="ai-confirm"><p class="ai-confirm-q">' + svg('shield') + '<span>' + esc(it.text) + '</span></p>' +
          (it.state === 'pending'
            ? '<div class="ai-confirm-btns"><button class="ai-btn main" type="button" data-confirm="' + it.id + '" data-ok="1">Permitir</button><button class="ai-btn" type="button" data-confirm="' + it.id + '" data-ok="0">Rechazar</button></div>'
            : '<p class="ai-confirm-state">' + (it.state === 'approved' ? 'Permitido' : 'Rechazado') + '</p>') + '</li>';
      case 'notice':
        return '<li class="ai-notice">' + svg('x') + '<span>' + esc(it.text) + '</span></li>';
      default:
        return '';
    }
  }

  function build() {
    root = document.createElement('div');
    root.id = 'ligrow-ai';
    root.hidden = true;
    root.innerHTML =
      '<button class="ai-launcher" type="button" data-act="open" aria-label="Abrir el asistente de IA">' + svg('sparkles') + 'Asistente</button>' +
      '<aside class="ai-panel" role="complementary" aria-label="Asistente de IA" hidden>' +
        '<header class="ai-head"><div class="ai-head-l"><span class="ai-logo">' + svg('sparkles') + '</span><div><div class="ai-title">Asistente</div><div class="ai-sub">Texto, voz e imágenes</div></div></div>' +
          '<div class="ai-head-r">' +
            (canSpeak() ? '<button class="ai-icon-btn" type="button" data-act="speak" aria-label="Leer las respuestas en voz alta" title="Leer las respuestas en voz alta"></button>' : '') +
            '<button class="ai-icon-btn" type="button" data-act="reset" aria-label="Nueva conversación" title="Nueva conversación">' + svg('reset') + '</button>' +
            '<button class="ai-icon-btn" type="button" data-act="close" aria-label="Cerrar el asistente">' + svg('x') + '</button>' +
          '</div></header>' +
        '<div class="ai-body"><div class="ai-warn" hidden></div><div class="ai-intro"></div><ol class="ai-list" aria-live="polite"></ol><div class="ai-end"></div></div>' +
        '<footer class="ai-foot"><ul class="ai-thumbs" hidden></ul><p class="ai-err" role="alert" hidden></p><p class="ai-interim" hidden></p>' +
          '<div class="ai-box"><input type="file" accept="image/*,application/pdf,.pdf" multiple hidden>' +
            '<button class="ai-icon-btn" type="button" data-act="attach" aria-label="Adjuntar imagen o PDF" title="Adjuntar imagen o PDF">' + svg('image') + '</button>' +
            '<textarea rows="1" aria-label="Mensaje para el asistente" placeholder="Escribe, dicta o adjunta una factura…"></textarea>' +
            (Recognition ? '<button class="ai-icon-btn ai-mic" type="button" data-act="mic" aria-label="Dictar por voz"></button>' : '') +
            '<button class="ai-send" type="button" data-act="send" aria-label="Enviar" disabled>' + svg('send') + '</button>' +
          '</div>' +
          (Recognition ? '<label class="ai-auto"><input type="checkbox" checked data-act="auto"> Enviar al terminar de dictar</label>' : '') +
        '</footer></aside>';
    document.body.appendChild(root);

    const ta = root.querySelector('.ai-box textarea');
    const panel = root.querySelector('.ai-panel');

    root.addEventListener('click', (e) => {
      const undoBtn = e.target.closest('[data-undo]');
      if (undoBtn) { undoAction(undoBtn.getAttribute('data-undo')); return; }
      const conf = e.target.closest('[data-confirm]');
      if (conf) { answerConfirmation(conf.getAttribute('data-confirm'), conf.getAttribute('data-ok') === '1'); return; }
      const chip = e.target.closest('[data-chip]');
      if (chip) { ta.value = chip.getAttribute('data-chip'); autoGrow(ta); paintFoot(); ta.focus(); return; }
      const rm = e.target.closest('[data-rm]');
      if (rm) { A.images = A.images.filter((i) => i.id !== rm.getAttribute('data-rm')); paintFoot(); return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      switch (act.getAttribute('data-act')) {
        case 'open': setOpen(true); break;
        case 'close': setOpen(false); break;
        case 'reset': reset(); ta.value = ''; paintFoot(); break;
        case 'speak': A.readAloud = !A.readAloud; stopSpeaking(); paintHead(); break;
        case 'attach': root.querySelector('input[type=file]').click(); break;
        case 'mic': if (A.listening) stopVoice(); else startVoice(); break;
        case 'send': if (A.busy) stop(); else submit(ta.value); break;
        default: break;
      }
    });
    root.querySelector('input[type=file]').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
    const auto = root.querySelector('[data-act=auto]');
    if (auto) auto.addEventListener('change', () => { A.autoSend = auto.checked; });

    ta.addEventListener('input', () => { autoGrow(ta); paintFoot(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!A.busy) submit(ta.value); }
    });
    ta.addEventListener('paste', (e) => {
      const files = [...(e.clipboardData ? e.clipboardData.files : [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); addFiles(files); }
    });
    panel.addEventListener('dragover', (e) => { e.preventDefault(); if (!A.dragging) { A.dragging = true; panel.classList.add('dragging'); } });
    panel.addEventListener('dragleave', (e) => { if (e.target === panel) { A.dragging = false; panel.classList.remove('dragging'); } });
    panel.addEventListener('drop', (e) => { e.preventDefault(); A.dragging = false; panel.classList.remove('dragging'); addFiles([...e.dataTransfer.files]); });

    // Escape cierra el panel (en fase de captura: si hay un modal abierto, Escape se queda para el modal).
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && A.open && !S.modal && !A.items.some((i) => i.kind === 'confirm' && i.state === 'pending')) setOpen(false);
    }, true);
  }

  const autoGrow = (ta) => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 128) + 'px'; };

  async function submit(text) {
    const ta = root.querySelector('.ai-box textarea');
    const images = A.images.slice();
    stopSpeaking();
    ta.value = '';
    autoGrow(ta);
    A.images = [];
    A.error = '';
    A.interim = '';
    paintFoot();
    await send(text, images);
  }

  function setOpen(open) {
    A.open = open;
    if (open) loadStatus();
    paintAll();
    if (open) setTimeout(() => { const ta = root.querySelector('.ai-box textarea'); if (ta) ta.focus(); }, 50);
  }

  // ── Pintado (parcial, para no perder el borrador ni el foco) ────────────────────────────────────────────────────────────
  function paintList() {
    if (!root) return;
    const list = root.querySelector('.ai-list');
    const intro = root.querySelector('.ai-intro');
    intro.innerHTML = A.items.length
      ? ''
      : '<p class="ai-hello">Dime qué quieres hacer: consulto y cambio clientes, tareas, recordatorios, documentos, proveedores y pedidos; leo facturas (imagen o PDF) y las registro; y creo facturas para tus clientes. Casi todo lo que hago se puede deshacer; lo que borra algo solo lo hago con tu permiso.</p>' +
        '<ul class="ai-chips">' + SUGGESTIONS.map((s) => '<li><button class="ai-chip" type="button" data-chip="' + esc(s) + '">' + esc(s) + '</button></li>').join('') + '</ul>';
    list.innerHTML = A.items.map(itemHtml).join('') + (A.busy ? '<li class="ai-typing" role="status" aria-label="El asistente está trabajando"><i></i><i></i><i></i></li>' : '');
    const end = root.querySelector('.ai-end');
    if (end && A.open) end.scrollIntoView({ block: 'end' });
    // Lee en voz alta solo las respuestas nuevas del asistente.
    const msgs = A.items.filter((i) => i.kind === 'assistant');
    if (A.readAloud && msgs.length > spokenCount) speak(msgs[msgs.length - 1].text);
    spokenCount = msgs.length;
  }

  function paintBusy() {
    paintList();
    paintFoot();
  }

  function paintWarn() {
    if (!root) return;
    const w = root.querySelector('.ai-warn');
    w.hidden = A.configured;
    w.innerHTML = 'El asistente no está activado: falta la clave de API en el servidor (<code>ANTHROPIC_API_KEY</code>).';
  }

  function paintHead() {
    if (!root) return;
    const b = root.querySelector('[data-act=speak]');
    if (b) {
      b.classList.toggle('on', A.readAloud);
      b.setAttribute('aria-pressed', String(A.readAloud));
      b.innerHTML = svg(A.readAloud ? 'volume' : 'volumeOff');
    }
  }

  function paintFoot() {
    if (!root) return;
    const ta = root.querySelector('.ai-box textarea');
    const thumbs = root.querySelector('.ai-thumbs');
    thumbs.hidden = !A.images.length;
    thumbs.innerHTML = A.images.map((i) => '<li>' + (i.kind === 'pdf' ? '<span class="ai-pdfchip">' + svg('file') + esc(i.name) + '</span>' : '<img alt="Imagen adjunta" src="' + i.dataUrl + '">') + '<button type="button" data-rm="' + i.id + '" aria-label="Quitar adjunto">' + svg('x') + '</button></li>').join('');
    const err = root.querySelector('.ai-err');
    err.hidden = !A.error;
    err.textContent = A.error;
    const interim = root.querySelector('.ai-interim');
    interim.hidden = !A.interim;
    interim.textContent = A.interim ? 'Escuchando: ' + A.interim : '';
    const mic = root.querySelector('.ai-mic');
    if (mic) {
      mic.classList.toggle('listening', A.listening);
      mic.setAttribute('aria-pressed', String(A.listening));
      mic.setAttribute('aria-label', A.listening ? 'Dejar de dictar' : 'Dictar por voz');
      mic.innerHTML = svg(A.listening ? 'micOff' : 'mic');
    }
    const sendBtn = root.querySelector('.ai-send');
    sendBtn.classList.toggle('stop', A.busy);
    sendBtn.setAttribute('aria-label', A.busy ? 'Detener' : 'Enviar');
    sendBtn.innerHTML = svg(A.busy ? 'square' : 'send');
    sendBtn.disabled = !A.busy && !(ta.value.trim() || A.images.length);
  }

  function paintAll() {
    if (!root) return;
    root.querySelector('.ai-launcher').hidden = A.open;
    root.querySelector('.ai-panel').hidden = !A.open;
    paintHead();
    paintWarn();
    paintList();
    paintFoot();
  }

  /** Muestra u oculta el asistente según haya sesión; reinicia la conversación si cambia el usuario. */
  function sync() {
    if (!root) return;
    const key = S.currentUser ? (S.currentUser.email || 'user') : '';
    if (key !== A.userKey) {
      const hadUser = !!A.userKey;
      A.userKey = key;
      if (hadUser || !key) { A.open = false; reset(); }
      A.risks = null;
      statusPromise = null;
      A.configured = true;
    }
    root.hidden = !key;
    if (!key && A.open) { A.open = false; paintAll(); }
  }

  function init() {
    if (root) return;
    build();
    // Se engancha a render() de la app para mostrar/ocultar el botón según la sesión.
    const original = window.render;
    if (typeof original === 'function') {
      window.render = function () {
        const out = original.apply(this, arguments);
        try { sync(); } catch (e) { /* el asistente nunca debe romper la app */ }
        return out;
      };
    }
    paintAll();
    sync();
  }

  window.LigrowAI = { open: () => setOpen(true), close: () => setOpen(false), send, reset, state: A };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
