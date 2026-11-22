# Asistente de IA

Asistente integrado en la app (botón flotante «Asistente», panel a la derecha) que consulta y cambia clientes, tareas, recordatorios, documentos, proveedores y pedidos a partir de texto, voz o imágenes. Sigue el mismo diseño que el asistente de Pic Negre Marketing Hub.

## Arquitectura

```text
Navegador (panel)                       Servidor                         Anthropic
  public/assistant.js  ── POST /api/assistant ──►  sesión + límites ──►  Messages API
  bucle de herramientas  ◄── content + stop_reason ─────────────────────┘
  public/assistant-tools.js ejecuta cada herramienta con las funciones de la propia app
```

- **El modelo corre en el servidor** (`src/routes/assistant.routes.js` → `src/services/assistant.service.js`). La clave nunca llega al navegador.
- **Las herramientas se ejecutan en el navegador** (`public/assistant-tools.js`) sobre `DATA`, `save()`, `normTask()`, `render()`… es decir, por la misma vía que los botones: permisos por cliente (`canAccessClient`), historial de actividad y sincronización con Supabase. No hay una segunda vía de escritura.
- Un mensaje del usuario puede dar varias vueltas (modelo → herramientas → modelo), hasta 12.
- Se usa el SDK oficial `@anthropic-ai/sdk` (única dependencia nueva).
- Las definiciones de herramientas están en `src/services/assistant.tools.js` (fuente única); el panel obtiene el riesgo de cada una en `GET /api/assistant/status`.

## Dónde está el usuario

Cada mensaje lleva una línea de contexto: fecha real, usuario, pantalla actual (Dashboard, Kanban, cliente › pestaña, Proveedores › Pedidos…) y un resumen de lo visible (cliente abierto, filtros del Kanban y de Pedidos, tarea abierta). «Aquí», «este cliente» o «esta tarea» se resuelven con eso. `get_current_view` devuelve el detalle completo.

## Qué puede hacer

**Consultar:** resumen general, dashboard, clientes, tareas (con filtros y plazos), calendario, actividad, documentos, apps, proveedores y pedidos.

**Cambiar (reversible):** crear/editar tareas (estado, prioridad, fecha, responsable, etiqueta), checklist, enlaces y comentarios; crear/editar clientes y su semáforo; recordatorios; documentos; pedidos (incluidos estado de pago y de entrega); proveedores y categorías; navegar y filtrar el Kanban.

**Con permiso del usuario (no reversible):** borrar tareas, clientes, recordatorios, documentos, pedidos y proveedores.

**Facturas de proveedores:** lee facturas y albaranes adjuntos (imagen o PDF, hasta 4 PDF de ~1,4 MB por conversación) y los registra como pedidos: busca o crea el proveedor, extrae número, fecha, concepto y total, deja el desglose de IVA en las notas y **adjunta el propio archivo** al pedido (`attachment_refs`: cada adjunto del chat recibe un identificador `adjunto_1`…). Con `read_order_document` también puede releer los archivos ya guardados en un pedido.

**Vista previa del producto:** localiza la página del producto en la web del proveedor con la búsqueda web de Anthropic (herramienta de servidor, `ANTHROPIC_WEB_SEARCH=0` la desactiva) y llama a `set_order_product`. El servidor (`GET /api/assistant/link-preview`) lee la página y extrae imagen, título y precio (Open Graph / JSON-LD) con protección SSRF: solo http(s) públicos en puertos estándar, direcciones privadas bloqueadas al conectar, redirecciones revalidadas y límites de tiempo y tamaño. La fila del pedido muestra la miniatura y el enlace «Ver producto».

**Facturación emitida** (solo administradores; sección **Facturas** del menú): clientes de facturación, ajustes del emisor y facturas. El asistente crea, edita, anula y consulta facturas (también puede registrar una ya emitida con su número original, p. ej. la 104). **Todos los importes los calcula el código** con precisión de céntimos (`public/invoice-calc.js`, con tests): si el usuario da un total con IVA incluido, el IVA es «total − base», así que el total facturado coincide exactamente; con IRPF, `total = base + IVA − IRPF`. Si faltan datos del emisor o del cliente (NIF, dirección, código postal, población) la herramienta lo rechaza y el asistente los pide. Numeración correlativa: con la serie vacía, 104, 105, 106… (sigue desde la mayor y nunca baja del «numerar desde» de los ajustes); con serie, `F-2026-0001`.

La factura se muestra con la plantilla de Ligrow (A4, tipografía espaciada, etiquetas en catalán o castellano, cifras «950», «199.50», «-142.50», «1007€») y se descarga con «PDF / Imprimir» (diálogo de impresión → Guardar como PDF). El PDF no se almacena: se regenera siempre a partir del registro guardado.

**Almacenamiento (Supabase).** Tres tablas propias (`database/migrations/20261124_invoicing.sql`): `invoice_settings`, `invoice_customers` e `invoices`, con RLS activado y accesibles solo desde el servidor (clave de servicio). Cada factura guarda una **copia** de los datos del emisor y del cliente al emitirla; `number` es único y la base de datos rechaza estados no válidos y facturas sin líneas. API: `GET /api/invoicing` y `PUT/DELETE` de `/settings`, `/customers/:id` e `/invoices/:id` (solo administradores). **El servidor valida y recalcula** los totales con el mismo módulo de cálculo antes de guardar. El navegador envía solo lo que cambia y, si Supabase rechaza algo (tablas sin crear, clave pública, número duplicado), se avisa en pantalla y el asistente lo dice: nunca se da por guardado algo que no lo está. Si el servidor no tiene Supabase (solo desarrollo local) usa memoria y la interfaz muestra «Guardado temporal».

**No expuesto a propósito:** usuarios, contraseñas, sesiones y credenciales.

Los usuarios que no son administradores solo ven sus clientes y no tienen acceso a proveedores/pedidos ni a las pantallas globales, igual que en la app.

## Seguridad

| Riesgo | Control |
| --- | --- |
| El modelo entiende mal una petición | Las referencias ambiguas devuelven candidatos en lugar de actuar; fechas, estados y prioridades se validan antes de cambiar nada. |
| Acción destructiva | La app (no el modelo) pide permiso antes de ejecutarla. Un rechazo vuelve al modelo como `declined`. |
| Cambios en cadena | A partir del 6.º cambio en un turno la app pide permiso para seguir. Máximo 12 rondas por mensaje. |
| Inyección desde el texto de tareas, notas o imágenes | El prompt lo trata como datos; los borrados están protegidos por la app, diga lo que diga el modelo. |
| Enlaces peligrosos | Solo se aceptan URLs `http(s)://` en enlaces y documentos. |
| Abuso y coste | Requiere sesión; 40 peticiones / 5 min por usuario (en memoria, por instancia); cuerpo ≤ 4 MB, ≤ 8 imágenes, 120 mensajes. |

## Deshacer

Cada acción reversible registra su inverso en memoria (solo durante la conversación): botón «Deshacer» en la tarjeta o la herramienta `undo_last_actions`. Los borrados no se pueden deshacer.

## Voz e imágenes

- **Voz:** Web Speech API del navegador (español); Chrome, Edge y Safari. Lectura en voz alta opcional con `speechSynthesis`.
- **Imágenes:** adjuntas, pegadas o arrastradas; se reducen y comprimen en el navegador (≤ 1568 px, JPEG) y viajan con el mensaje; no se guardan.

## Configuración

| Variable | Uso |
| --- | --- |
| `ANTHROPIC_API_KEY` | Obligatoria. Secreto solo de servidor (Vercel → Settings → Environment Variables, Production y Preview). También se acepta `ANTHROPIC_KEY`. Sin ella el panel muestra «no activado». |
| `ANTHROPIC_WEB_SEARCH` | Opcional. `0` desactiva la búsqueda web del asistente (si la organización no la tiene activada en la consola de Anthropic, el servidor continúa automáticamente sin ella). |
| `ANTHROPIC_MODEL` | Opcional. Por defecto `claude-opus-5-5`; `claude-sonnet-5-5` cuesta aproximadamente la mitad. |

`vercel.json` fija `maxDuration: 60` s para la función (un turno con herramientas puede tardar).

## Migraciones opcionales (Supabase)

La app funciona sin ellas (los datos se conservan en el espacio sincronizado), pero para guardar estos campos en la tabla `supplier_orders`:
`database/migrations/20261122_supplier_orders_delivery.sql` (estado de entrega) y `database/migrations/20261123_supplier_orders_product.sql` (enlace y vista previa del producto).

**Obligatoria para facturar:** `database/migrations/20261124_invoicing.sql`. Opcional, después: `database/migrations/20261124_invoicing_seed.sql` (emisor, cliente La3Cultural y la factura 104; siguiente número: 106).

## Pruebas

`npm test` ejecuta los tests de Node: servicio del asistente (validación, límites, PDF, búsqueda web, errores del proveedor), cálculo de facturas (céntimos, IVA, IRPF, numeración), servicio de facturación contra un Supabase simulado y vista previa de enlaces (SSRF y extracción de metadatos).

## Límites conocidos

- Los cambios en un cliente que no es el abierto se guardan y sincronizan igualmente, pero el nombre de un cliente solo se guarda en local (igual que al editarlo a mano).
- Las respuestas no se emiten token a token; cada ronda vuelve completa.
- El límite de peticiones es por instancia serverless, no global.
- No se ha probado contra la API real de Anthropic en desarrollo (sin clave): la forma de la petición sigue los tipos del SDK y se ha verificado con una API simulada de extremo a extremo.
