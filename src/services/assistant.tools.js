/**
 * Herramientas del asistente de IA.
 *
 * Se declaran aquí (JSON puro) para que el servidor las envíe al modelo; se EJECUTAN en el navegador
 * (public/assistant.js) con las mismas estructuras de datos y funciones que usan los botones de la app,
 * así que respetan sus reglas, la sincronización con Supabase y los permisos de la sesión.
 *
 * risk:
 *   read    – solo consulta (o navegación): no cambia datos.
 *   write   – cambia datos y se puede deshacer.
 *   confirm – destructivo o irreversible: la app pide permiso al usuario antes de ejecutarlo.
 */

const text = (description) => ({ type: 'string', description });
const num = (description) => ({ type: 'integer', description });
const bool = (description) => ({ type: 'boolean', description });
const oneOf = (values, description) => ({ type: 'string', enum: values, description });
const date = (extra = '') => text(('Fecha en formato AAAA-MM-DD. ' + extra).trim());

const PRIORITY = oneOf(['Alta', 'Media', 'Baja'], 'Prioridad de la tarea: Alta, Media o Baja');
const STATUS = oneOf(
  ['Sin empezar', 'Trabajando', 'Esperando feedback', 'Listo'],
  'Estado (columna del Kanban): Sin empezar, Trabajando, Esperando feedback (esperando al cliente) o Listo (completada)'
);
const CLIENT = text('Cliente (nombre, siglas o id). Por defecto el cliente abierto en pantalla');
const PAY = oneOf(['Pagado', 'Recibido', 'Pendiente'], 'Estado de pago: Pagado, Recibido (factura recibida, pendiente de pagar) o Pendiente');
const DELIVERY = oneOf(['Entregado', 'En curso', 'Pendiente'], 'Estado de entrega: Entregado, En curso o Pendiente');

const defs = [
  // ---- Lectura ---------------------------------------------------------------------------------
  {
    name: 'get_workspace_summary',
    risk: 'read',
    description: 'Resumen general: clientes con su semáforo, tareas por estado, vencidas, de hoy y de los próximos 7 días, recordatorios pendientes y pedidos a proveedores por pagar o sin entregar. Úsalo para «¿cómo estamos?».'
  },
  {
    name: 'get_current_view',
    risk: 'read',
    description: 'Lo que el usuario está viendo ahora mismo: pantalla, cliente/tarea/pedido abiertos con su detalle completo y el estado visible (pestaña, filtros). Úsalo para «aquí», «esta tarea», «este cliente», «esto que veo».'
  },
  {
    name: 'get_dashboard',
    risk: 'read',
    description: 'Contenido del Dashboard: clientes activos, tareas por estado y, por cliente, sus tareas trabajando y esperando feedback.'
  },
  { name: 'list_clients', risk: 'read', description: 'Lista los clientes con semáforo, responsable y número de tareas por estado.' },
  { name: 'get_client', risk: 'read', description: 'Detalle de un cliente: datos, semáforo, tareas, recordatorios y documentos.', properties: { client: CLIENT }, },
  {
    name: 'search_tasks',
    risk: 'read',
    description: 'Busca tareas de uno o todos los clientes. Devuelve como máximo `limit` (25 por defecto).',
    properties: {
      query: text('Texto a buscar en título, descripción, etiqueta o código (CPB-02)'),
      client: text('Cliente (nombre, siglas o id); vacío = todos'),
      status: STATUS,
      priority: PRIORITY,
      owner: text('Responsable'),
      due: oneOf(['overdue', 'today', 'next7', 'none', 'any'], 'overdue = vencidas, today = hoy, next7 = próximos 7 días, none = sin fecha'),
      include_done: bool('Incluir las completadas (por defecto no)'),
      limit: num('Máximo de resultados (1-50)')
    }
  },
  {
    name: 'get_task',
    risk: 'read',
    description: 'Detalle de una tarea: descripción, checklist, enlaces, archivos y comentarios.',
    properties: { task: text('Código (CPB-02), id o título'), client: text('Cliente, si el título puede repetirse') },
    required: ['task']
  },
  { name: 'get_calendar', risk: 'read', description: 'Tareas con fecha de vencimiento y recordatorios con fecha entre dos fechas. Por defecto, desde hoy y los próximos 30 días.', properties: { from: date('Inicio'), to: date('Fin') } },
  { name: 'list_activity', risk: 'read', description: 'Historial de actividad reciente (auditoría) de un cliente: quién cambió qué y cuándo.', properties: { client: CLIENT, limit: num('Máximo de entradas (1-30)') } },
  { name: 'list_documents', risk: 'read', description: 'Documentos y recursos (enlaces, archivos, Drive, Figma) de un cliente.', properties: { client: CLIENT, query: text('Texto a buscar') } },
  { name: 'list_apps', risk: 'read', description: 'Lista las apps propias (Pic Negre Hub, Ligrow Tasks…) con descripción y conexiones.' },
  {
    name: 'list_suppliers',
    risk: 'read',
    description: 'Catálogo de proveedores por categoría, con contacto, plazos y tarifas.',
    properties: { query: text('Texto a buscar en nombre, tipo o servicios'), category: text('Categoría (Impresión, Diseño…)') }
  },
  {
    name: 'list_orders',
    risk: 'read',
    description: 'Pedidos a proveedores con importe, estado de pago y de entrega y documentos adjuntos.',
    properties: {
      query: text('Texto a buscar en concepto, proveedor o referencia'),
      supplier: text('Proveedor'),
      payment_status: PAY,
      delivery_status: DELIVERY
    }
  },

  // ---- Tareas (reversibles) ------------------------------------------------------------------------
  {
    name: 'create_task',
    risk: 'write',
    description: 'Crea una tarea en un cliente. Si no se indica cliente va al abierto en pantalla (o al primero). Empieza «Sin empezar» salvo que se indique otro estado.',
    properties: {
      title: text('Título'),
      client: CLIENT,
      description: text('Descripción'),
      due_date: date('Vacío = sin vencimiento'),
      priority: PRIORITY,
      status: STATUS,
      owner: text('Responsable (por defecto el del cliente)'),
      tag: text('Etiqueta (Web, SEO, Legal…)'),
      checklist: { type: 'array', items: { type: 'string' }, description: 'Elementos iniciales de la checklist' }
    },
    required: ['title']
  },
  {
    name: 'update_task',
    risk: 'write',
    description: 'Modifica una tarea: título, descripción, fecha (cadena vacía la quita), prioridad, estado, responsable o etiqueta. También sirve para moverla de columna o completarla (status = Listo).',
    properties: {
      task: text('Código (CPB-02), id o título'),
      client: text('Cliente, si el título puede repetirse'),
      title: text('Nuevo título'),
      description: text('Nueva descripción'),
      due_date: date('Cadena vacía para quitar la fecha'),
      priority: PRIORITY,
      status: STATUS,
      owner: text('Responsable'),
      tag: text('Etiqueta')
    },
    required: ['task']
  },
  { name: 'add_checklist_item', risk: 'write', description: 'Añade un elemento a la checklist de una tarea.', properties: { task: text('Tarea'), client: text('Cliente'), text: text('Texto del elemento') }, required: ['task', 'text'] },
  { name: 'toggle_checklist_item', risk: 'write', description: 'Marca o desmarca un elemento de la checklist de una tarea.', properties: { task: text('Tarea'), client: text('Cliente'), item: text('Texto (o parte) del elemento') }, required: ['task', 'item'] },
  { name: 'remove_checklist_item', risk: 'write', description: 'Quita un elemento de la checklist de una tarea (se puede deshacer).', properties: { task: text('Tarea'), client: text('Cliente'), item: text('Texto (o parte) del elemento') }, required: ['task', 'item'] },
  { name: 'add_task_link', risk: 'write', description: 'Añade un enlace (Drive, Figma, web…) a una tarea.', properties: { task: text('Tarea'), client: text('Cliente'), url: text('Enlace'), label: text('Nombre del enlace') }, required: ['task', 'url'] },
  { name: 'remove_task_link', risk: 'write', description: 'Quita un enlace de una tarea (se puede deshacer).', properties: { task: text('Tarea'), client: text('Cliente'), link: text('Nombre (o parte) del enlace') }, required: ['task', 'link'] },
  { name: 'add_task_comment', risk: 'write', description: 'Añade un comentario a una tarea con el nombre del usuario como autor.', properties: { task: text('Tarea'), client: text('Cliente'), text: text('Comentario') }, required: ['task', 'text'] },

  // ---- Clientes, recordatorios y documentos (reversibles) ----------------------------------------
  {
    name: 'create_client',
    risk: 'write',
    description: 'Crea un cliente nuevo (solo administradores).',
    properties: { name: text('Nombre'), description: text('Descripción o especialidad'), responsable: text('Responsable (por defecto el usuario)') },
    required: ['name']
  },
  {
    name: 'update_client',
    risk: 'write',
    description: 'Modifica un cliente: nombre, descripción, responsable o semáforo de estado (verde = activo, naranja = standby, rojo = inactivo).',
    properties: {
      client: CLIENT,
      name: text('Nuevo nombre'),
      description: text('Nueva descripción'),
      responsable: text('Responsable'),
      traffic_light: oneOf(['verde', 'naranja', 'rojo'], 'Semáforo de estado del cliente')
    }
  },
  {
    name: 'add_reminder',
    risk: 'write',
    description: 'Añade un recordatorio / tema pendiente a un cliente.',
    properties: { client: CLIENT, text: text('Título del recordatorio'), detail: text('Detalle'), due: text('Fecha (AAAA-MM-DD) o texto como «Viernes»') },
    required: ['text']
  },
  {
    name: 'update_reminder',
    risk: 'write',
    description: 'Cambia el título, el detalle o la fecha de un recordatorio.',
    properties: { client: CLIENT, reminder: text('Título (o parte) del recordatorio'), text: text('Nuevo título'), detail: text('Nuevo detalle'), due: text('Nueva fecha (cadena vacía para quitarla)') },
    required: ['reminder']
  },
  { name: 'toggle_reminder', risk: 'write', description: 'Marca o desmarca un recordatorio como resuelto.', properties: { client: CLIENT, reminder: text('Título (o parte) del recordatorio') }, required: ['reminder'] },
  {
    name: 'add_document',
    risk: 'write',
    description: 'Añade un recurso (enlace a Drive, Figma, web…) a la biblioteca de un cliente.',
    properties: { client: CLIENT, name: text('Nombre'), url: text('Enlace'), description: text('Descripción') },
    required: ['name', 'url']
  },

  // ---- Proveedores y pedidos (reversibles) -----------------------------------------------------------
  {
    name: 'create_order',
    risk: 'write',
    description: 'Registra un pedido a un proveedor (pestaña Proveedores › Pedidos).',
    properties: {
      supplier: text('Proveedor del catálogo (nombre)'),
      concept: text('Concepto o descripción del pedido'),
      amount: { type: 'number', description: 'Importe total en euros' },
      order_date: date('Por defecto hoy'),
      payment_status: PAY,
      delivery_status: DELIVERY,
      invoice_number: text('Nº de factura o referencia'),
      notes: text('Notas')
    },
    required: ['supplier', 'concept']
  },
  {
    name: 'update_order',
    risk: 'write',
    description: 'Modifica un pedido: concepto, importe, fecha, estado de pago, estado de entrega, referencia o notas.',
    properties: {
      order: text('Referencia, id o parte del concepto'),
      concept: text('Nuevo concepto'),
      amount: { type: 'number', description: 'Nuevo importe en euros' },
      order_date: date(),
      payment_status: PAY,
      delivery_status: DELIVERY,
      invoice_number: text('Nueva referencia'),
      notes: text('Nuevas notas')
    },
    required: ['order']
  },
  {
    name: 'create_supplier',
    risk: 'write',
    description: 'Añade un proveedor a una categoría del catálogo.',
    properties: {
      category: text('Categoría existente (Impresión, Diseño…)'),
      name: text('Nombre'),
      type: text('Tipo (Imprenta digital, Estudio…)'),
      email: text('Email'),
      phone: text('Teléfono'),
      website: text('Web'),
      payment_terms: text('Forma de pago'),
      lead_time: text('Plazo de entrega'),
      notes: text('Nota destacada')
    },
    required: ['category', 'name']
  },
  { name: 'create_supplier_category', risk: 'write', description: 'Crea una categoría en el catálogo de proveedores.', properties: { name: text('Nombre') }, required: ['name'] },

  // ---- Navegación y vista (no cambian datos) -----------------------------------------------------------
  {
    name: 'navigate_to',
    risk: 'read',
    description: 'Lleva al usuario a otra pantalla (no cambia datos). Para un cliente o una tarea concretos indica su nombre.',
    properties: {
      screen: oneOf(['dashboard', 'kanban_global', 'projects', 'calendar', 'client', 'suppliers', 'orders', 'app', 'settings'], 'Pantalla'),
      client: text('Cliente a abrir (para screen = client)'),
      view: oneOf(['resumen', 'kanban', 'actividad'], 'Pestaña del cliente'),
      task: text('Abrir el detalle de esta tarea'),
      app: text('App a abrir (para screen = app)')
    }
  },
  { name: 'set_kanban_filter', risk: 'read', description: 'Filtra el Kanban por responsable («todos» quita el filtro). No cambia datos.', properties: { owner: text('Responsable o «todos»') }, required: ['owner'] },

  // ---- Borrados (siempre con confirmación) ------------------------------------------------------------
  { name: 'delete_task', risk: 'confirm', description: 'Elimina una tarea. No se puede deshacer.', properties: { task: text('Código, id o título'), client: text('Cliente') }, required: ['task'] },
  { name: 'delete_client', risk: 'confirm', description: 'Elimina un cliente con todas sus tareas, recordatorios y documentos. No se puede deshacer.', properties: { client: text('Nombre, siglas o id') }, required: ['client'] },
  { name: 'delete_reminder', risk: 'confirm', description: 'Elimina un recordatorio. No se puede deshacer.', properties: { client: CLIENT, reminder: text('Título (o parte) del recordatorio') }, required: ['reminder'] },
  { name: 'delete_document', risk: 'confirm', description: 'Elimina un recurso de la biblioteca de un cliente. No se puede deshacer.', properties: { client: CLIENT, document: text('Nombre (o parte) del recurso') }, required: ['document'] },
  { name: 'delete_order', risk: 'confirm', description: 'Elimina un pedido a proveedor con sus documentos adjuntos. No se puede deshacer.', properties: { order: text('Referencia, id o parte del concepto') }, required: ['order'] },
  { name: 'delete_supplier', risk: 'confirm', description: 'Elimina un proveedor del catálogo. No se puede deshacer.', properties: { supplier: text('Nombre del proveedor') }, required: ['supplier'] },

  // ---- Deshacer --------------------------------------------------------------------------------------------
  {
    name: 'undo_last_actions',
    risk: 'write',
    description: 'Deshace las últimas acciones reversibles que hizo el asistente en esta conversación (la más reciente primero). Las que no son reversibles se indican.',
    properties: { count: num('Cuántas deshacer (1 por defecto, máximo 10)') }
  }
];

const toSchema = (def) => ({
  type: 'object',
  properties: def.properties || {},
  ...(def.required && def.required.length ? { required: def.required } : {})
});

const assistantTools = defs.map((def) => ({ name: def.name, description: def.description, input_schema: toSchema(def) }));
const toolRisk = Object.fromEntries(defs.map((def) => [def.name, def.risk]));

module.exports = { assistantTools, toolRisk };
