// E2E in real Chromium: popup summary (fonts/colors) + hover inspector overlay. Needs /tmp/phtest playwright.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import http from 'node:http'; import assert from 'node:assert/strict';
const require = createRequire(process.env.PW || '/tmp/phtest/package.json');
const { chromium } = require('playwright');
const src = path.resolve(new URL('../ext', import.meta.url).pathname);
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'piext-')); fs.cpSync(src, ext, { recursive: true });
const m = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'))); m.host_permissions = ['<all_urls>'];
m.background = { service_worker: 'sw.js' }; fs.writeFileSync(path.join(ext, 'sw.js'), ''); fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(m));
const page = `<!doctype html><meta charset="utf-8"><title>Style demo</title>
<body style="margin:0;font-family:Georgia,serif;color:#333333;background:#fafafa">
<header style="background:#1a365d;color:#ffffff;padding:20px;font-family:Arial,sans-serif;font-weight:700">Brand header</header>
<h1 id="h" style="font:700 40px/48px Arial,sans-serif;color:#b83280;margin:20px">Big title</h1>
<p style="margin:20px">Body copy paragraph one.</p><p style="margin:20px">Body copy paragraph two.</p>
<x-card id="xc" style="display:block;margin:20px;background:#22543d"></x-card>
<script>document.getElementById('xc').attachShadow({ mode: 'open' }).innerHTML = '<span style="font:400 20px/30px Courier New,monospace;color:#ffffff">Shadow text</span>';</script></body>`;
const srv = http.createServer((q, r) => { r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.end(page); });
await new Promise(ok => srv.listen(8958, '127.0.0.1', ok));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'piprof-')), {
  channel: 'chromium', headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const p = await ctx.newPage(); await p.setViewportSize({ width: 800, height: 500 }); await p.goto('http://127.0.0.1:8958/');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1:8958/*' }))[0].id);
  const pop = await ctx.newPage(); const errs = []; pop.on('pageerror', e => errs.push(e.message));
  await pop.goto(`chrome-extension://${id}/popup.html?tabId=${tabId}`); await pop.waitForSelector('.f');
  assert.deepEqual(errs, []);
  const fonts = await pop.$$eval('.f b', bs => bs.map(b => b.textContent));
  assert.ok(fonts.includes('Georgia 400') && fonts.includes('Arial 700'), 'fonts: ' + fonts);
  const text = await pop.$$eval('#text .sw', s => s.map(x => x.textContent));
  assert.ok(['#333333', '#b83280', '#ffffff'].every(c => text.includes(c)), 'text colors: ' + text);
  const bg = await pop.$$eval('#bg .sw', s => s.map(x => x.textContent));
  assert.ok(bg.includes('#fafafa') && bg.includes('#1a365d'), 'bg colors: ' + bg);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await pop.click('#css'); const css = await pop.evaluate(() => navigator.clipboard.readText());
  assert.ok(css.startsWith(':root {') && css.includes('--bg-1: #') && css.includes('--font-1: "'), 'css vars: ' + css);
  for (const [fmt, re] of [['scss', /^\$text-1: #/], ['tw4', /^@theme \{\n  --color-text-1: #/], ['tw3', /"bg": \{\n\s+"1": "#/], ['json', /"fonts": \[/]]) {
    await pop.selectOption('#fmt', fmt); await pop.click('#css'); const out = await pop.evaluate(() => navigator.clipboard.readText());
    assert.ok(re.test(out), fmt + ': ' + out); if (fmt === 'json') JSON.parse(out);
  }
  // 0.2 file exports: .ase (binary, parse header + first swatch) and .gpl.
  for (const fmt of ['ase', 'gpl']) {
    await pop.selectOption('#fmt', fmt); assert.equal(await pop.textContent('#css'), 'Download');
    const [dl] = await Promise.all([pop.waitForEvent('download'), pop.click('#css')]);
    assert.ok(dl.suggestedFilename().endsWith('-palette.' + fmt), dl.suggestedFilename());
    const b = await (await import('node:fs')).promises.readFile(await dl.path());
    if (fmt === 'ase') {
      assert.equal(b.toString('latin1', 0, 4), 'ASEF'); const n = b.readUInt32BE(8); assert.ok(n > 0, 'ase count');
      const nameLen = b.readUInt16BE(18), m = 20 + nameLen * 2; assert.equal(b.toString('latin1', m, m + 4), 'RGB ');
      assert.equal(b.readUInt32BE(14), 2 + nameLen * 2 + 18, 'ase block length');
      const [r, g, bl] = [0, 1, 2].map(i => Math.round(b.readFloatBE(m + 4 + i * 4) * 255));
      assert.ok(r >= 0 && r <= 255 && g >= 0 && bl <= 255, 'ase rgb');
    } else assert.ok(/^GIMP Palette\nName: .+\nColumns: 8\n#\n\s*\d+\s+\d+\s+\d+\ttext-1 #/.test(b.toString()), 'gpl: ' + b);
  }
  await pop.selectOption('#fmt', 'css');
  await pop.setViewportSize({ width: 396, height: 420 }); await pop.screenshot({ path: path.join(os.tmpdir(), 'pi-popup.png') });
  // Hover inspector
  await pop.click('#inspect'); await p.bringToFront();
  const hb = await p.locator('#h').boundingBox(); await p.mouse.move(hb.x + 30, hb.y + 20);
  const card = await p.evaluate(() => document.getElementById('__plaininspect__')?.shadowRoot.querySelector('.card').textContent.replace(/\s+/g, ' '));
  assert.ok(card && card.includes('Arial') && card.includes('40px / 48px') && card.includes('#b83280 on #fafafa') && /contrast 5\.\d\d:1 AAA \(large text\)/.test(card), 'card: ' + card);
  await p.screenshot({ path: path.join(os.tmpdir(), 'pi-hover.png') });
  // Text inside an open shadow root: the inspector descends past the host, and the background is found above the root.
  const xb = await p.locator('#xc').boundingBox(); await p.mouse.move(xb.x + 20, xb.y + 12);
  const card2 = await p.evaluate(() => document.getElementById('__plaininspect__').shadowRoot.querySelector('.card').textContent.replace(/\s+/g, ' '));
  assert.ok(card2.includes('Courier New') && card2.includes('#ffffff on #22543d') && card2.includes('<span>'), 'shadow card: ' + card2);
  await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(() => !!document.getElementById('__plaininspect__')), false, 'Esc removes overlay');
  console.log('plaininspect e2e ok');
} finally { await ctx.close(); srv.close(); }
