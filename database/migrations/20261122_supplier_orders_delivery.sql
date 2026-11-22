-- Migración: estado de entrega independiente del estado de pago en supplier_orders
-- Estado de pago   (columna status):          'Pagado' | 'Recibido' (factura recibida, pendiente de pago) | 'Pendiente'
-- Estado de entrega (columna delivery_status): 'Entregado' | 'En curso' | 'Pendiente'
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- (La app sigue funcionando sin esta migración: el estado de entrega se guarda en el espacio sincronizado.)

begin;

alter table supplier_orders
  add column if not exists delivery_status text not null default '';

-- Rellenar a partir de los estados antiguos
update supplier_orders
set delivery_status = case
  when status ilike 'pagad%' then 'Entregado'
  when status ilike 'recib%' or status ilike '%produc%' then 'En curso'
  else 'Pendiente'
end
where delivery_status = '';

create index if not exists supplier_orders_delivery_idx on supplier_orders (delivery_status);

commit;
