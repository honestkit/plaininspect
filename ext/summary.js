// Injected via executeScript({func: pageSummary}). Self-contained. Fonts/colors actually used by visible text & backgrounds.
export function pageSummary(limit = 3000) {
  const toHex = c => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c); if (!m) return null;
    if (m[4] !== undefined && Number(m[4]) === 0) return null;
    return '#' + [m[1], m[2], m[3]].map(x => Number(x).toString(16).padStart(2, '0')).join('');
  };
  const fonts = new Map(); const text = new Map(); const bg = new Map();
  const bump = (m, k, n = 1) => { if (k) m.set(k, (m.get(k) || 0) + n); };
  let i = 0;
  // Open shadow roots are walked too (web-component sites render most of their text there, e.g. caniuse.com).
  const all = [document.documentElement, document.body];
  const walk = root => { for (const el of root.querySelectorAll('*')) { if (all.length > limit) return; all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } };
  walk(document.body);
  for (const el of all) {
    if (++i > limit) break;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const ownText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    if (ownText) {
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      bump(fonts, `${fam}|${cs.fontWeight}`); bump(text, toHex(cs.color));
    }
    bump(bg, toHex(cs.backgroundColor), Math.round(r.width * r.height / 1000) + 1);
  }
  const top = (m, n) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
  return { fonts: top(fonts, 12).map(([k, n]) => { const [family, weight] = k.split('|'); return { family, weight, count: n }; }),
    text: top(text, 10).map(([hex, n]) => ({ hex, count: n })), bg: top(bg, 10).map(([hex, n]) => ({ hex, count: n })) };
}

// Hover inspector overlay. Toggle: running it again removes it. Esc exits; click pins/unpins a card.
export function toggleInspector() {
  const ID = '__plaininspect__';
  const old = document.getElementById(ID); if (old) { old.remove(); window.__plainInspectOff?.(); return false; }
  const host = document.createElement('div'); host.id = ID;
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    .box{position:fixed;border:2px solid #d53f8c;background:#d53f8c14;pointer-events:none}
    .card{position:fixed;font:12px/1.4 system-ui,sans-serif;background:#1a202c;color:#fff;padding:8px 10px;border-radius:6px;max-width:320px;box-shadow:0 6px 20px #0005}
    .card b{font-weight:600} .sw{display:inline-block;width:10px;height:10px;border:1px solid #fff8;margin-right:4px;vertical-align:-1px}
    .hint{position:fixed;top:8px;right:8px;font:12px system-ui;background:#d53f8c;color:#fff;padding:4px 8px;border-radius:4px}
    .pinned{border:1px solid #d53f8c}</style><div class="box"></div><div class="card" hidden></div><div class="hint">PlainInspect: hover · click to pin · Esc to exit</div>`;
  document.documentElement.append(host);
  const box = root.querySelector('.box'); const card = root.querySelector('.card');
  const hex = c => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c); if (!m) return c;
    const h = '#' + [m[1], m[2], m[3]].map(x => Number(x).toString(16).padStart(2, '0')).join('');
    return m[4] !== undefined && Number(m[4]) < 1 ? `${h} @ ${m[4]}` : h; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const effBg = el => { // first non-transparent background up the tree (what the text actually sits on)
    for (let n = el; n && n.nodeType === 1; n = n.parentElement || n.getRootNode().host) { // .host: continue above a shadow root
      const c = getComputedStyle(n).backgroundColor; const m = /rgba\([^)]*,\s*([\d.]+)\)/.exec(c);
      if (c !== 'transparent' && !(m && Number(m[1]) === 0)) return c;
    }
    return 'rgb(255, 255, 255)';
  };
  const rgb = c => (/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c) || [0, 0, 0, 0]).slice(1, 4).map(Number);
  const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const grade = (ratio, large) => ratio >= (large ? 4.5 : 7) ? 'AAA' : ratio >= (large ? 3 : 4.5) ? 'AA' : 'fail';
  let pinned = false;
  const show = (el, x, y) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const bgc = effBg(el);
    const ratio = contrast(cs.color, bgc); const px = parseFloat(cs.fontSize);
    const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700); const g = grade(ratio, large);
    const rendered = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    card.innerHTML = `<b>${esc(rendered)}</b> ${esc(cs.fontWeight)}${cs.fontStyle !== 'normal' ? ' ' + esc(cs.fontStyle) : ''}<br>
      ${esc(cs.fontSize)} / ${esc(cs.lineHeight)} · letter-spacing ${esc(cs.letterSpacing)}<br>
      <span class="sw" style="background:${esc(cs.color)}"></span>${esc(hex(cs.color))} on <span class="sw" style="background:${esc(bgc)}"></span>${esc(hex(bgc))}<br>
      contrast ${ratio.toFixed(2)}:1 <b style="color:${g === 'fail' ? '#fc8181' : '#68d391'}">${g}</b>${large ? ' (large text)' : ''}<br>
      <span style="opacity:.7">stack: ${esc(cs.fontFamily).slice(0, 120)}</span><br>
      <span style="opacity:.7">&lt;${el.tagName.toLowerCase()}&gt; ${Math.round(r.width)}×${Math.round(r.height)}</span>`;
    card.hidden = false;
    const cx = Math.min(x + 14, innerWidth - 330); const cy = y + 14 + 130 > innerHeight ? y - 140 : y + 14;
    Object.assign(card.style, { left: Math.max(4, cx) + 'px', top: Math.max(4, cy) + 'px' });
  };
  const onMove = e => { if (pinned) return; let el = document.elementFromPoint(e.clientX, e.clientY);
    // elementFromPoint stops at a shadow host: descend into open shadow roots to the element actually under the pointer.
    while (el && el !== host && el.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(e.clientX, e.clientY); if (!inner || inner === el) break; el = inner; }
    if (el && el !== host) show(el, e.clientX, e.clientY); };
  const onClick = e => { e.preventDefault(); e.stopPropagation(); pinned = !pinned; card.classList.toggle('pinned', pinned); if (!pinned) onMove(e); };
  const onKey = e => { if (e.key === 'Escape') { host.remove(); off(); } };
  const off = () => { removeEventListener('mousemove', onMove, true); removeEventListener('click', onClick, true); removeEventListener('keydown', onKey, true); };
  addEventListener('mousemove', onMove, true); addEventListener('click', onClick, true); addEventListener('keydown', onKey, true);
  window.__plainInspectOff = off;
  return true;
}
