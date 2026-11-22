const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { requireAppSession } = require('../middleware/session-auth.middleware');
const router = express.Router();
const BUCKET = 'private-invoices';

router.use(requireAppSession, (req, res, next) => {
  const owner = process.env.INVOICES_OWNER_USER_ID;
  if (!owner || !db || !process.env.SUPABASE_SERVICE_KEY || !process.env.APP_SESSION_SECRET || process.env.APP_SESSION_SECRET.length < 32) {
    return res.status(503).json({ error: 'La sección privada de facturas aún no está configurada.' });
  }
  if (req.sessionUser.userId !== owner) return res.status(403).json({ error: 'Acceso restringido.' });
  req.invoiceOwner = owner;
  res.set('Cache-Control', 'private, no-store');
  next();
});

router.get('/', async (req,res) => {
  const {data,error} = await db.from('private_invoices').select('id,direction,invoice_number,issue_date,counterparty,product,quantity,unit_price,total,payment_status,notes,pdf_path,created_at').eq('owner_id',req.invoiceOwner).order('issue_date',{ascending:false});
  if(error) return res.status(503).json({error:'No se pueden cargar las facturas.'});
  res.json({invoices:(data||[]).map(({pdf_path,...rest})=>({...rest,has_pdf:!!pdf_path}))});
});
router.post('/', async (req,res) => {
  const d=req.body||{};
  const text=(v,n)=>String(v||'').trim().slice(0,n);
  const quantity=Number(d.quantity), unit_price=Number(d.unit_price), total=Number(d.total);
  if(!['issued','received'].includes(d.direction)||!text(d.invoice_number,100)||!text(d.counterparty,200)||!/^\d{4}-\d{2}-\d{2}$/.test(d.issue_date||'')||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(unit_price)||unit_price<0||!Number.isFinite(total)||total<0||!['pending','paid'].includes(d.payment_status)) return res.status(400).json({error:'Revisa los campos de la factura.'});
  const row={id:crypto.randomUUID(),owner_id:req.invoiceOwner,direction:d.direction,invoice_number:text(d.invoice_number,100),issue_date:d.issue_date,counterparty:text(d.counterparty,200),product:text(d.product,500),quantity,unit_price,total,payment_status:d.payment_status,notes:text(d.notes,3000)};
  const {data,error}=await db.from('private_invoices').insert(row).select('id').single();
  if(error)return res.status(503).json({error:'No se ha podido guardar la factura.'});
  res.status(201).json({id:data.id});
});
router.post('/:id/pdf', async (req,res) => {
  const id=req.params.id;
  if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'Factura inválida.'});
  const {data:invoice,error}=await db.from('private_invoices').select('id,pdf_path').eq('id',id).eq('owner_id',req.invoiceOwner).maybeSingle();
  if(error||!invoice)return res.status(404).json({error:'Factura no encontrada.'});
  if(invoice.pdf_path)return res.status(409).json({error:'La factura ya tiene un PDF original.'});
  const b64=req.body?.pdf;
  if(typeof b64!=='string'||b64.length>4194304||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))return res.status(400).json({error:'PDF inválido o demasiado grande (máximo 3 MB).'});
  const bytes=Buffer.from(b64,'base64');
  if(bytes.length>3145728||bytes.subarray(0,5).toString()!=='%PDF-')return res.status(400).json({error:'El archivo debe ser un PDF válido de hasta 3 MB.'});
  const path=crypto.randomUUID()+'.pdf';
  const upload=await db.storage.from(BUCKET).upload(path,bytes,{contentType:'application/pdf',upsert:false});
  if(upload.error)return res.status(503).json({error:'No se ha podido guardar el PDF.'});
  const result=await db.from('private_invoices').update({pdf_path:path,updated_at:new Date().toISOString()}).eq('id',id).eq('owner_id',req.invoiceOwner).is('pdf_path',null).select('id');
  if(result.error||!result.data?.length){await db.storage.from(BUCKET).remove([path]);return res.status(503).json({error:'No se ha podido asociar el PDF.'});}
  res.status(201).json({success:true});
});
router.get('/:id/pdf', async (req,res) => {
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return res.sendStatus(400);
  const {data,error}=await db.from('private_invoices').select('pdf_path').eq('id',req.params.id).eq('owner_id',req.invoiceOwner).maybeSingle();
  if(error||!data?.pdf_path)return res.status(404).json({error:'PDF no encontrado.'});
  const file=await db.storage.from(BUCKET).download(data.pdf_path);
  if(file.error)return res.status(503).json({error:'No se puede descargar el PDF.'});
  res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="factura.pdf"','X-Content-Type-Options':'nosniff'}).send(Buffer.from(await file.data.arrayBuffer()));
});
module.exports=router;
