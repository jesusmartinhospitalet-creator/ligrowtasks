const express = require('express');
const { requireAdmin } = require('../middleware/session-auth.middleware');
const { getInvoicingService, InvoicingError } = require('../services/invoicing.service');

const router = express.Router();

// La facturación solo la gestionan los administradores.
router.use(requireAdmin);
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const handle = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (error) {
    if (error instanceof InvoicingError) return res.status(error.status).json({ error: error.code, message: error.message });
    console.error('[invoicing] error inesperado', error);
    res.status(500).json({ error: 'internal', message: 'No se ha podido completar la operación.' });
  }
};

const svc = () => getInvoicingService();

router.get('/', handle(() => svc().getAll()));
router.put('/settings', handle(async (req) => ({ settings: await svc().saveSettings(req.body) })));
router.put('/customers/:id', handle(async (req) => ({ customer: await svc().saveCustomer(req.params.id, req.body) })));
router.delete('/customers/:id', handle(async (req) => { await svc().deleteCustomer(req.params.id); return { ok: true }; }));
router.put('/invoices/:id', handle(async (req) => ({ invoice: await svc().saveInvoice(req.params.id, req.body) })));
router.delete('/invoices/:id', handle(async (req) => { await svc().deleteInvoice(req.params.id); return { ok: true }; }));

module.exports = router;
