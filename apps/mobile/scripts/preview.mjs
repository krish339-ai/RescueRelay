/** Managed visual-QA harness only: exported RN Web UI + real API, synthetic in-memory data. */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { mobileRoot, expoCli, expoEnvironment } from './expo-environment.mjs';

const exported = spawnSync(process.execPath, [expoCli, 'export', '--platform', 'web', '--clear', '--output-dir', 'preview-dist'], {
  cwd: mobileRoot,
  env: expoEnvironment({ EXPO_PUBLIC_API_URL: 'same-origin', EXPO_NO_TELEMETRY: '1', CI: '1' }),
  stdio: 'inherit',
});
if (exported.status !== 0) process.exit(exported.status ?? 1);
// This harness must never inherit an externally configured reasoning provider.
process.env.REASONING_PROVIDER = '';
process.env.AI_EXTERNAL_CALLS_ENABLED = 'false';
const { createApp } = await import('../../api/src/app.ts');
const { app } = await createApp({ databasePath: ':memory:', demoMode: true, rateLimit: true });
await app.ready();
const dist = resolve(mobileRoot, 'preview-dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://preview.local');
    if (url.pathname.startsWith('/api/')) {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 256 * 1024) { res.writeHead(413); res.end('Request too large'); return; } }
      const response = await app.inject({ method: req.method, url: url.pathname + url.search, headers: req.headers, payload: body || undefined, remoteAddress: '127.0.0.1' });
      res.writeHead(response.statusCode, response.headers); res.end(response.rawPayload); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const decoded = decodeURIComponent(url.pathname);
    let file = resolve(dist, '.' + (decoded === '/' ? '/index.html' : decoded));
    if (file !== dist && !file.startsWith(dist + sep)) { res.writeHead(403); res.end(); return; }
    const info = await stat(file); if (!info.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') { res.end(); return; }
    const content = await readFile(file);
    // A narrow, labelled QA canvas; this is still a browser render, never a device screenshot.
    res.end(extname(file) === '.html' ? content.toString().replace('</head>', '<style>html,body{background:#dce1d6!important}#root{max-width:430px;margin:0 auto;box-shadow:0 0 60px #173f3520}</style></head>') : content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port');
server.listen(port, '127.0.0.1', () => console.log(`RescueRelay RN Web QA preview listening on http://127.0.0.1:${port} (synthetic memory-only API; no provider)`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(async () => { await app.close(); process.exit(0); }));
