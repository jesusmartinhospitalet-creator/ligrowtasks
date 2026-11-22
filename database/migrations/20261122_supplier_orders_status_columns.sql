-- Migración: Añadir columnas payment_status y delivery_status a supplier_orders
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run

begin;

alter table supplier_orders
  add column if not exists payment_status text not null default 'pendiente'
    check (payment_status in ('pagado', 'pendiente')),
  add column if not exists delivery_status text not null default 'solicitado'
    check (delivery_status in ('solicitado', 'en_produccion', 'recibido', 'cancelado'));

-- Derivar estados iniciales del campo legacy 'status'
update supplier_orders set
  payment_status = case status
    when 'Pagado'       then 'pagado'
    else 'pendiente'
  end,
  delivery_status = case status
    when 'Pagado'        then 'recibido'
    when 'Recibido'      then 'recibido'
    when 'En producción' then 'en_produccion'
    else 'solicitado'
  end
where payment_status = 'pendiente' and delivery_status = 'solicitado';

commit;
