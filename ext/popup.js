import { pageSummary, toggleInspector } from './summary.js';
const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.display = 'block'; setTimeout(() => { t.style.display = 'none'; }, 1500); }
const swatch = c => el('span', { className: 'sw', title: `${c.count} uses`, onclick: async () => { await navigator.clipboard.writeText(c.hex); toast(`Copied ${c.hex}`); } },
  Object.assign(el('i'), { style: `background:${c.hex}` }), c.hex);

async function main() {
  const forced = Number(new URLSearchParams(location.search).get('tabId')); // tests drive a specific tab
  const [tab] = forced ? [await chrome.tabs.get(forced)] : await chrome.tabs.query({ active: true, currentWindow: true });
  $('inspect').onclick = async () => {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: toggleInspector });
    if (!forced) window.close();
  };
  let s;
  try { [{ result: s }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageSummary }); }
  catch { $('info').textContent = "Can't read this page"; $('inspect').disabled = true; return; }
  $('info').textContent = `${s.fonts.length} font styles`;
  $('fonts').replaceChildren(...s.fonts.map(f => el('div', { className: 'f' },
    el('b', { textContent: `${f.family} ${f.weight}`, style: `font-family:"${f.family.replace(/"/g, '')}";font-weight:${f.weight}` }), el('span', { textContent: `${f.count}×` }))));
  $('text').replaceChildren(...s.text.map(swatch));
  $('bg').replaceChildren(...s.bg.map(swatch));
  const host = (() => { try { return new URL(tab.url).hostname.replace(/^www\./, ''); } catch { return 'page'; } })();
  $('fmt').onchange = () => { $('css').textContent = FILES[$('fmt').value] ? 'Download' : 'Copy'; };
  $('css').onclick = async () => {
    const fmt = $('fmt').value;
    if (FILES[fmt]) {
      const [type, data] = fmt === 'ase' ? ['application/octet-stream', paletteASE(s)] : ['text/plain', paletteGPL(s, host)];
      el('a', { href: URL.createObjectURL(new Blob([data], { type })), download: `${host}-palette.${FILES[fmt]}` }).click();
      return toast(`Downloaded ${host}-palette.${FILES[fmt]}`);
    }
    await navigator.clipboard.writeText(paletteText(s, fmt)); toast(`Copied ${$('fmt').selectedOptions[0].textContent}`);
  };
}

// 0.2 file exports: Adobe Swatch Exchange (Photoshop/Illustrator/InDesign/Affinity) and GIMP/Inkscape/Krita .gpl.
const FILES = { ase: 'ase', gpl: 'gpl' };
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const named = s => [...s.text.map((c, i) => [`text-${i + 1}`, c.hex]), ...s.bg.map((c, i) => [`bg-${i + 1}`, c.hex])];
export function paletteGPL(s, name = 'page') {
  return `GIMP Palette\nName: ${name}\nColumns: 8\n#\n` + named(s).map(([n, hex]) => rgb(hex).map(v => String(v).padStart(3)).join(' ') + `\t${n} ${hex}`).join('\n') + '\n';
}
export function paletteASE(s) {
  const cols = named(s), blocks = cols.map(([n]) => 2 + (n.length + 1) * 2 + 4 + 12 + 2);
  const buf = new DataView(new ArrayBuffer(12 + blocks.reduce((a, b) => a + b + 6, 0)));
  let o = 0; const u16 = v => { buf.setUint16(o, v); o += 2; }, u32 = v => { buf.setUint32(o, v); o += 4; };
  [0x41, 0x53, 0x45, 0x46].forEach(b => buf.setUint8(o++, b)); u16(1); u16(0); u32(cols.length); // "ASEF" v1.0
  cols.forEach(([n, hex], i) => {
    u16(1); u32(blocks[i]); u16(n.length + 1); for (const ch of n) u16(ch.charCodeAt(0)); u16(0); // colour entry, UTF-16BE name
    [0x52, 0x47, 0x42, 0x20].forEach(b => buf.setUint8(o++, b)); // "RGB "
    rgb(hex).forEach(v => { buf.setFloat32(o, v / 255); o += 4; }); u16(2); // normal (non-global) colour
  });
  return new Uint8Array(buf.buffer);
}

// Palette export: CSS variables, SCSS, Tailwind v4 @theme, Tailwind v3 config, JSON tokens.
export function paletteText(s, fmt = 'css') {
  const q = f => `"${f.family.replace(/"/g, '')}"`;
  const vars = (pre, text, bg, font) => [...s.text.map((c, i) => `${pre}${text}${i + 1}: ${c.hex};`), ...s.bg.map((c, i) => `${pre}${bg}${i + 1}: ${c.hex};`),
    ...s.fonts.map((f, i) => `${pre}${font}${i + 1}: ${q(f)}; /* weight ${f.weight} */`)];
  if (fmt === 'scss') return vars('$', 'text-', 'bg-', 'font-').join('\n') + '\n';
  if (fmt === 'tw4') return `@theme {\n${vars('  --', 'color-text-', 'color-bg-', 'font-f').join('\n')}\n}\n`;
  const obj = arr => Object.fromEntries(arr.map((c, i) => [i + 1, c.hex]));
  if (fmt === 'tw3') return `// tailwind.config.js\nmodule.exports = { theme: { extend: ${JSON.stringify({ colors: { text: obj(s.text), bg: obj(s.bg) },
    fontFamily: Object.fromEntries(s.fonts.map((f, i) => [`f${i + 1}`, [f.family]])) }, null, 2).replace(/\n/g, '\n  ')} } };\n`;
  if (fmt === 'json') return JSON.stringify({ text: s.text.map(c => c.hex), bg: s.bg.map(c => c.hex),
    fonts: s.fonts.map(f => ({ family: f.family, weight: f.weight })) }, null, 2) + '\n';
  return `:root {\n${vars('  --', 'text-', 'bg-', 'font-').join('\n')}\n}\n`;
}
main();
