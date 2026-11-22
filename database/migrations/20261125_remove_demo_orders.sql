-- Elimina los pedidos de demostración (datos inventados) de Proveedores › Pedidos:
--   · PrintOnDemand BCN · 500 flyers   · Grafisant · 2 roll-ups   · Estudi Forma · manual de identidad
-- Solo toca esos tres pedidos (por su id fijo); los pedidos reales que hayas añadido no se modifican.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run. Es idempotente.

begin;

-- 1. Tabla de pedidos
delete from supplier_orders
where id in (
  '4a1e9b20-cc8d-4e1a-92de-002000000001',
  '4a1e9b20-cc8d-4e1a-92de-002000000002',
  '4a1e9b20-cc8d-4e1a-92de-002000000003'
);

-- 2. Copia de los pedidos en el espacio sincronizado de proveedores (workspace_sync, client_id = 'pv')
update workspace_sync
set payload = jsonb_set(
      payload,
      '{orders}',
      coalesce(
        (select jsonb_agg(o)
           from jsonb_array_elements(payload -> 'orders') as o
          where o ->> 'id' not in (
            '4a1e9b20-cc8d-4e1a-92de-002000000001',
            '4a1e9b20-cc8d-4e1a-92de-002000000002',
            '4a1e9b20-cc8d-4e1a-92de-002000000003'
          )),
        '[]'::jsonb
      )
    ),
    updated_at = now()
where client_id = 'pv'
  and jsonb_typeof(payload -> 'orders') = 'array';

commit;
