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
| `ANTHROPIC_MODEL` | Opcional. Por defecto `claude-opus-5-5`; `claude-sonnet-5-5` cuesta aproximadamente la mitad. |

`vercel.json` fija `maxDuration: 60` s para la función (un turno con herramientas puede tardar).

## Pruebas

`npm test` ejecuta `tests/assistant.service.test.js` (validación, límites, errores del proveedor, forma de la petición al modelo con un cliente simulado).

## Límites conocidos

- Los cambios en un cliente que no es el abierto se guardan y sincronizan igualmente, pero el nombre de un cliente solo se guarda en local (igual que al editarlo a mano).
- Las respuestas no se emiten token a token; cada ronda vuelve completa.
- El límite de peticiones es por instancia serverless, no global.
- No se ha probado contra la API real de Anthropic en desarrollo (sin clave): la forma de la petición sigue los tipos del SDK y se ha verificado con una API simulada de extremo a extremo.
