const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

const css = fs.readFileSync(path.join(rootDir, 'styles.css'), 'utf-8');
const js = fs.readFileSync(path.join(rootDir, 'app-v3.js'), 'utf-8');

const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ligrow Tasks · Personal & Project Hub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
${css}
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
${js}
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(rootDir, 'index.html'), html, 'utf-8');
if (!fs.existsSync(path.join(rootDir, 'public'))) {
  fs.mkdirSync(path.join(rootDir, 'public'), { recursive: true });
}
fs.writeFileSync(path.join(rootDir, 'public', 'index.html'), html, 'utf-8');

console.log('[bundle-static] Generated self-contained index.html and public/index.html successfully!');
