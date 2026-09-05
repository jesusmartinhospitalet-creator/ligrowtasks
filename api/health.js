module.exports = (req, res) => {
  res.status(200).json({ status: 'ok', app: 'Ligrow Tasks', time: new Date().toISOString() });
};
