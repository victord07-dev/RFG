import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');
const cssFile = readdirSync(assets).find((file) => file.endsWith('.css'));
const jsFile = readdirSync(assets).find((file) => file.endsWith('.js'));

if (!cssFile || !jsFile) {
  throw new Error('Build assets not found. Run npm.cmd run build first.');
}

const css = readFileSync(path.join(assets, cssFile), 'utf8');
const js = readFileSync(path.join(assets, jsFile), 'utf8');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f6f8f5" />
    <link rel="icon" type="image/png" href="./rfg-icon.png" />
    <title>RFG Admin Panel</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
${js}
    </script>
  </body>
</html>
`;

writeFileSync(path.join(dist, 'open-me.html'), html);
console.log('Created dist/open-me.html');
