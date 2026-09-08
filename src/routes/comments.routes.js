const express = require('express');
const router = express.Router();
const service = require('../services/comment.service');

router.get('/task/:taskId', async (req, res) => {
  try {
    const comments = await service.getCommentsByTask(req.params.taskId);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/task/:taskId', async (req, res) => {
  try {
    const { author, text } = req.body;
    const comment = await service.addComment(req.params.taskId, author, text);
    res.json(comment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:commentId', async (req, res) => {
  try {
    const result = await service.deleteComment(req.params.commentId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
