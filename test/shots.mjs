// CWS screenshots (1280x800) + promo tile (440x280) → ../store/. Demo data is fictional.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
const require = createRequire(process.env.PW || '/tmp/phtest/package.json');
const { chromium } = require('playwright');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'piext-')); fs.cpSync(path.join(root, 'ext'), ext, { recursive: true });
const m = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'))); m.host_permissions = ['<all_urls>'];
m.background = { service_worker: 'sw.js' }; fs.writeFileSync(path.join(ext, 'sw.js'), ''); fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(m));
const demo = `<meta charset="utf-8"><title>Studio (demo)</title><body style="margin:0;font-family:Georgia,serif;color:#2d3748;background:#fffaf0">
<header style="background:#234e52;color:#e6fffa;padding:14px 20px;font:600 15px system-ui">Demo Studio · Work · About · Contact</header>
<main style="padding:10px 24px"><h1 id="h" style="font:800 38px/44px system-ui;color:#b83280;margin:18px 0 8px">Design that reads well</h1>
<p style="font-size:17px;line-height:1.6">A demo page with a serif body, a bold sans-serif headline and a small palette of brand colors for the inspector to find.</p>
<p style="display:inline-block;background:#ed8936;color:#fff;padding:8px 14px;border-radius:6px;font:600 14px system-ui">Get in touch</p></main></body>`;
const srv = http.createServer((q, r) => { r.setHeader('Content-Type', 'text/html; charset=utf-8'); r.end(demo); });
await new Promise(ok => srv.listen(8959, '127.0.0.1', ok));
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'piprof-')), {
  channel: 'chromium', headless: true, deviceScaleFactor: 2, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
try {
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  const page = await ctx.newPage(); await page.setViewportSize({ width: 620, height: 440 }); await page.goto('http://127.0.0.1:8959/');
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://127.0.0.1:8959/*' }))[0].id);
  const pagePng0 = (await page.screenshot()).toString('base64');
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 396, height: 420 });
  await pop.goto(`chrome-extension://${id}/popup.html?tabId=${tabId}`); await pop.waitForSelector('.f');
  const popPng = (await pop.screenshot()).toString('base64');
  await pop.click('#inspect'); await page.bringToFront(); const hb = await page.locator('#h').boundingBox(); await page.mouse.move(hb.x + 40, hb.y + 20);
  const pagePng = (await page.screenshot()).toString('base64');
  const shot = (cap, sub) => `<meta charset="utf-8"><body style="margin:0;width:1280px;height:800px;background:linear-gradient(135deg,#fbe9f3,#fff);font:18px system-ui;position:relative">
    <div style="position:absolute;left:60px;top:60px;width:1160px"><h1 style="font-size:40px;color:#521b41;margin:0 0 8px">${cap}</h1><p style="color:#444;margin:0">${sub}</p></div>
    <img src="data:image/png;base64,${pagePng}" style="position:absolute;left:60px;top:200px;width:620px;border-radius:8px;box-shadow:0 10px 30px #0002">
    <img src="data:image/png;base64,${popPng}" style="position:absolute;left:720px;top:200px;width:500px;border-radius:8px;box-shadow:0 12px 40px #0003"></body>`;
  const out = await ctx.newPage(); await out.setViewportSize({ width: 1280, height: 800 });
  const shots = [['shot1', 'What font is that? Hover and see.', 'Font family, size, line-height, weight and colors of any element. Click to pin, Esc to exit.'],
    ['shot2', "A page's fonts and palette at a glance", 'Every font style and color the page uses. Click a color to copy its hex.'],
    ['shot3', 'Private by design', 'Only reads the page you click it on. No account, no tracking, nothing leaves your browser.']];
  for (const [n, c, s] of shots) {
    await out.setContent(shot(c, s)); await out.waitForTimeout(200);
    await out.screenshot({ path: path.join(root, 'store', n + '.png'), scale: 'css' });
  }
  await out.setViewportSize({ width: 440, height: 280 });
  await out.setContent(`<meta charset="utf-8"><body style="margin:0;width:440px;height:280px;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#b83280;color:#fff;font:20px system-ui">
    <img src="data:image/png;base64,${fs.readFileSync(path.join(root, 'ext/icons/128.png')).toString('base64')}" width="96">
    <div style="font-size:34px;font-weight:700;margin-top:10px">PlainInspect</div><div>Fonts &amp; colors, one hover away</div></body>`);
  await out.screenshot({ path: path.join(root, 'store', 'tile-440x280.png'), scale: 'css' });
} finally { await ctx.close(); srv.close(); }
console.log('shots done');
