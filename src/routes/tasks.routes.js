const express = require('express');
const router = express.Router();

const service = require('../services/task.service');

router.get('/', async (req, res) => {
  try {
    const tasks = await service.listAllTasks();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/client/:clientId', async (req, res) => {
  try {
    const tasks = await service.listTasksByClient(req.params.clientId);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const task = await service.upsertTask(req.body);
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:taskId', async (req, res) => {
  try {
    const result = await service.deleteTask(req.params.taskId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
