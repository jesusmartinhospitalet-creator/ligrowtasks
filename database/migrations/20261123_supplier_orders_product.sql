-- Migración: enlace y vista previa del producto en los pedidos a proveedores
-- (los rellena el asistente de IA al localizar la página del producto en la web del proveedor).
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- La app sigue funcionando sin esta migración: los datos se conservan en el espacio sincronizado.

begin;

alter table supplier_orders
  add column if not exists product_url text not null default '',
  add column if not exists preview_image text not null default '',
  add column if not exists product_title text not null default '';

commit;
