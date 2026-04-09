const express = require('express');
const router = express.Router();

const service = require('../services/template.service');

router.get('/:clientId', async (req, res) => {
  try {
    const templates = await service.listTemplatesByClient(req.params.clientId);
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const template = await service.upsertTemplate(req.body);
    res.json(template);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:templateId', async (req, res) => {
  try {
    const result = await service.deleteTemplate(req.params.templateId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
