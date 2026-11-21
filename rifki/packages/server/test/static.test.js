import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStaticHandler } from '../src/static.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rifki-static-'));
  const pub = path.join(dir, 'public');
  fs.mkdirSync(pub);
  fs.writeFileSync(path.join(pub, 'index.html'), '<h1>Rıfkı</h1>');
  fs.writeFileSync(path.join(pub, 'app.js'), 'export const a = 1;');
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'gizli');
  const handler = createStaticHandler(pub);
  const server = http.createServer(async (req, res) => { if (!(await handler(req, res))) { res.writeHead(405); res.end(); } });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    port: server.address().port,
    stop: () => new Promise((r) => server.close(r)),
  })));
}

const get = (port, p, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', reject);
  req.end();
});

test('statik: ana sayfa, MIME türleri ve güvenlik başlıkları', async () => {
  const s = await setup();
  try {
    const r = await get(s.port, '/');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /text\/html; charset=utf-8/);
    assert.equal(r.body, '<h1>Rıfkı</h1>');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.match(r.headers['content-security-policy'], /script-src 'self'/);
    const js = await get(s.port, '/app.js');
    assert.match(js.headers['content-type'], /text\/javascript/);
    const head = await get(s.port, '/app.js', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
  } finally { await s.stop(); }
});

test('statik: olmayan dosya 404; kök dışına çıkış denemeleri engellenir', async () => {
  const s = await setup();
  try {
    assert.equal((await get(s.port, '/yok.js')).status, 404);
    for (const p of ['/../secret.txt', '/..%2fsecret.txt', '/%2e%2e/secret.txt', '/..%5csecret.txt', '/a/../../secret.txt']) {
      const r = await get(s.port, p);
      assert.notEqual(r.status, 200, p);
      assert.ok(!r.body.includes('gizli'), p);
    }
    assert.equal((await get(s.port, '/%00')).status, 400);
    assert.equal((await get(s.port, '/', 'POST')).status, 405);
  } finally { await s.stop(); }
});
