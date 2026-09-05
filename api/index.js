const fs = require('fs');
const path = require('path');

const FALLBACK_HTML = `<!doctype html>
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
</html>`;

module.exports = (req, res) => {
  try {
    const url = (req && req.url) ? req.url : '/';

    if (url.includes('styles.css')) {
      let css = '';
      try { css = fs.readFileSync(path.join(process.cwd(), 'styles.css'), 'utf-8'); } catch (_e1) {}
      if (!css) { try { css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf-8'); } catch (_e2) {} }
      if (!css) { try { css = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf-8'); } catch (_e3) {} }

      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      return res.status(200).send(css || '/* CSS */');
    }

    if (url.includes('app-v3.js') || url.includes('dashboard-v3.js') || url.includes('ligrow-hub-v3.js')) {
      let js = '';
      try { js = fs.readFileSync(path.join(process.cwd(), 'app-v3.js'), 'utf-8'); } catch (_e1) {}
      if (!js) { try { js = fs.readFileSync(path.join(__dirname, '../public/app-v3.js'), 'utf-8'); } catch (_e2) {} }
      if (!js) { try { js = fs.readFileSync(path.join(__dirname, '../app-v3.js'), 'utf-8'); } catch (_e3) {} }

      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      return res.status(200).send(js || 'console.log("App script");');
    }

    if (url.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).send(JSON.stringify({ status: 'ok', preview: true }));
    }

    let html = '';
    try { html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8'); } catch (_e1) {}
    if (!html) { try { html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf-8'); } catch (_e2) {} }
    if (!html) { try { html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf-8'); } catch (_e3) {} }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html || FALLBACK_HTML);
  } catch (err) {
    console.error('[Vercel Handler Error]:', err.message);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(FALLBACK_HTML);
  }
};
