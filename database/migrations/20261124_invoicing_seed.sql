-- Datos iniciales de facturación (OPCIONAL): emisor, primer cliente y la factura nº 104.
-- Ejecutar DESPUÉS de 20261124_invoicing.sql. Es idempotente: no pisa nada que ya exista.
-- Contiene datos personales y bancarios del titular: revisa antes de ejecutarlo.

begin;

insert into invoice_settings (
  id, company_name, tax_id, tax_id_label, address, postal_code, city, country,
  iban, bank_name, series, start_number, default_vat_rate, default_irpf_rate,
  payment_days, payment_method, invoice_language
) values (
  'default', 'Jesús Amadeo Martín González', '46470752B', 'DNI', 'Avinguda Saloria 32', '25700', 'La Seu d''Urgell', 'España',
  'ES53 0182 3050 0002 0200 1810', 'BBVA', '', 106, 21, 15,
  30, 'Transferencia bancaria', 'ca'
) on conflict (id) do nothing;

insert into invoice_customers (id, name, tax_id, address, postal_code, city, country)
values ('cus_la3cultural', 'La3Cultural Digital Studio, S.L.', 'B67377028', 'C/València 220, ppal 2', '08011', 'Barcelona', 'España')
on conflict (id) do nothing;

insert into invoices (
  id, number, series, status, issue_date, due_date, customer_id, customer, issuer, lines,
  vat_rate, irpf_rate, subtotal, vat_breakdown, vat_total, irpf, total,
  payment_method, iban, bank_name, created_by
) values (
  'inv_104_la3cultural', '104', '', 'emitida', '2026-03-23', null, 'cus_la3cultural',
  '{"id":"cus_la3cultural","name":"La3Cultural Digital Studio, S.L.","taxId":"B67377028","address":"C/València 220, ppal 2","postalCode":"08011","city":"Barcelona","province":"","country":"España","email":"","phone":""}'::jsonb,
  '{"companyName":"Jesús Amadeo Martín González","taxId":"46470752B","taxIdLabel":"DNI","address":"Avinguda Saloria 32","postalCode":"25700","city":"La Seu d''Urgell","country":"España","email":"","phone":"","website":""}'::jsonb,
  '[{"description":"Gestió, Publicació i Monitorització de Diferents Xarxes Socials i Continguts per a La3Cultural.","quantity":1,"unitPrice":950,"vatRate":21,"net":950,"vat":199.5,"total":1149.5}]'::jsonb,
  21, 15, 950.00, '[{"rate":21,"base":950,"vat":199.5}]'::jsonb, 199.50, 142.50, 1007.00,
  'Transferencia bancaria', 'ES53 0182 3050 0002 0200 1810', 'BBVA', 'Importación inicial'
) on conflict (id) do nothing;

commit;
