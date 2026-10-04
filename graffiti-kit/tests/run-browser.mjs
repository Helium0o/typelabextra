// Run an m28_*.js test body in headless Chromium against a served TypeLab app folder (no Electron needed).
//   node graffiti-kit/tests/run-browser.mjs <typelab-repo> [test=m28_graffiti.js] [outdir=.]
// Needs Playwright (PLAYWRIGHT_BROWSERS_PATH or a local install). WebGL runs on SwiftShader.
// Writes window.__sheets images as <outdir>/m28_<name>.png. In the exe use tools/exe-tests/cdp.mjs instead:
//   node cdp.mjs "evalfile:m28_graffiti.js" "saveimgs:m28_"
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [root = '.', test = 'm28_graffiti.js', outdir = '.'] = process.argv.slice(2);
const appDir = path.resolve(root, 'app');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const req = createRequire(import.meta.url);
let pw;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = req(p); break; } catch (e) { /* next */ } }
if (!pw) { console.error('Playwright not found'); process.exit(1); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const srv = http.createServer((q, r) => {
  const f = path.join(appDir, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(appDir) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0);
const port = srv.address().port;
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => window.TL && TL.ui && TL.ui.modes && TL.view, null, { timeout: 30000 });
await page.waitForTimeout(1500);
const body = fs.readFileSync(path.isAbsolute(test) ? test : path.join(HERE, test), 'utf8');
const res = await page.evaluate(`(async()=>{ ${body} })()`);
console.log(res);
const sheets = await page.evaluate(() => window.__sheets || {});
fs.mkdirSync(outdir, { recursive: true });
for (const [k, v] of Object.entries(sheets)) fs.writeFileSync(path.join(outdir, 'm28_' + k + '.png'), Buffer.from(v.split(',')[1], 'base64'));
await page.screenshot({ path: path.join(outdir, 'm28_ui.png') });
if (errs.length) console.log('PAGE ERRORS:\n' + errs.join('\n'));
await b.close(); srv.close();
