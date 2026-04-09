const express = require('express');
const router = express.Router();

const monthService = require('../services/month.service');
const monthGenerator = require('../services/month-generator.service');

router.get('/:clientId', async (req, res) => {
  try {
    const months = await monthService.listClientMonths(req.params.clientId);
    res.json(months);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const result = await monthGenerator.generateMonth(req.body.clientId, req.body.taskMonth || req.body.yearMonth);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/close', async (req, res) => {
  try {
    const result = await monthService.closeClientMonth(req.body.clientId, req.body.taskMonth);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/reopen', async (req, res) => {
  try {
    const result = await monthService.reopenClientMonth(req.body.clientId, req.body.taskMonth);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
