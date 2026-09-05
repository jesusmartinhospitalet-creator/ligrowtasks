const fs = require('fs');
const path = require('path');

let indexHtml = '';
try { indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8'); } catch (_e) {}
if (!indexHtml) {
  try { indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf-8'); } catch (_e) {}
}

let stylesCss = '';
try { stylesCss = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf-8'); } catch (_e) {}
if (!stylesCss) {
  try { stylesCss = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf-8'); } catch (_e) {}
}

let appJs = '';
try { appJs = fs.readFileSync(path.join(__dirname, '../public/app-v3.js'), 'utf-8'); } catch (_e) {}
if (!appJs) {
  try { appJs = fs.readFileSync(path.join(__dirname, '../app-v3.js'), 'utf-8'); } catch (_e) {}
}

module.exports = (req, res) => {
  const url = req.url || '/';

  if (url.includes('styles.css')) {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    return res.status(200).send(stylesCss || '/* CSS */');
  }

  if (url.includes('app-v3.js') || url.includes('dashboard-v3.js') || url.includes('ligrow-hub-v3.js')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    return res.status(200).send(appJs || 'console.log("App script loaded");');
  }

  if (url.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(JSON.stringify({ status: 'ok', preview: true }));
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (indexHtml) return res.status(200).send(indexHtml);

  return res.status(200).send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ligrow Tasks · Personal & Project Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=3.2" />
</head>
<body>
  <div id="app"></div>
  <script src="/app-v3.js?v=20.0"></script>
</body>
</html>`);
};
