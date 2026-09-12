const express = require('express');
const supplierService = require('../services/supplier.service');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const categories = await supplierService.listSupplierDirectory();
    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

router.post('/categories', async (req, res, next) => {
  try {
    const category = await supplierService.createCategory(req.body);
    res.status(201).json({ category });
  } catch (error) {
    next(error);
  }
});

router.delete('/categories/:id', async (req, res, next) => {
  try {
    await supplierService.removeCategory(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const supplier = await supplierService.createSupplier(req.body);
    res.status(201).json({ supplier });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const supplier = await supplierService.updateSupplier(req.params.id, req.body);
    res.json({ supplier });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await supplierService.removeSupplier(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
