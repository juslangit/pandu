#!/usr/bin/env node
// Records the demo clip shown on /pandu/ (MP4 + GIF + poster).
//
//   node tools/record-demo.mjs [base-url]      (default http://localhost:4321)
//
// Two takes are recorded with Playwright (desktop keyboard, then phone drawer),
// joined with ffmpeg and written to site/static/media/. A key-press label and a
// cursor dot are injected into the page during recording only.
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] || 'http://localhost:4321').replace(/\/$/, '');
const FF = process.env.FFMPEG || '/opt/homebrew/bin/ffmpeg';
const pw = await import(process.env.PLAYWRIGHT_PATH || '/Users/luqman/.local/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs');
const TMP = join(ROOT, '.playwright-cli/demo');
const OUT = join(ROOT, 'site/static/media');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

const HUD = `
(() => {
  const css = '.rec-key{position:fixed;left:24px;bottom:24px;z-index:99999;padding:10px 16px;border-radius:12px;background:#19191c;color:#fff;font:600 20px/1 "Hanken Grotesk",system-ui,sans-serif;opacity:0;transition:opacity .15s;pointer-events:none}.rec-key.on{opacity:1}.rec-dot{position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(42,114,222,.35);border:2px solid #2a72de;pointer-events:none;transition:transform .12s;left:-40px;top:-40px}.rec-dot.down{transform:scale(.7)}';
  const names = { ' ': 'Space', ArrowDown: '↓', ArrowUp: '↑', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Enter: 'Enter ↵', Tab: 'Tab ⇥' };
  addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    const k = document.createElement('div'); k.className = 'rec-key'; document.body.appendChild(k);
    const d = document.createElement('div'); d.className = 'rec-dot'; document.body.appendChild(d);
    let t;
    addEventListener('keydown', (e) => { k.textContent = (e.shiftKey && e.key === 'Tab' ? 'Shift ' : '') + (names[e.key] || e.key); k.classList.add('on'); clearTimeout(t); t = setTimeout(() => k.classList.remove('on'), 700); }, true);
    addEventListener('mousemove', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
    addEventListener('pointerdown', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; d.classList.add('down'); }, true);
    addEventListener('pointerup', () => d.classList.remove('down'), true);
  });
})();`;

const browser = await pw.chromium.launch();
const wait = (p, ms) => p.waitForTimeout(ms);

async function take(name, viewport, script) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 600, recordVideo: { dir: join(TMP, name), size: viewport } });
  await ctx.addInitScript(HUD);
  const page = await ctx.newPage();
  await script(page);
  await ctx.close();
  const dir = join(TMP, name);
  const f = readdirSync(dir).find((x) => x.endsWith('.webm'));
  return join(dir, f);
}

const desktop = await take('desktop', { width: 1280, height: 800 }, async (p) => {
  await p.goto(BASE + '/');
  await wait(p, 1800);
  await p.locator('.skip-link').focus();
  for (let i = 0; i < 4; i++) { await p.keyboard.press('Tab'); await wait(p, i === 3 ? 700 : 300); }
  await p.keyboard.press('Enter'); await wait(p, 1300);
  await p.keyboard.press('Tab'); await wait(p, 500);
  await p.keyboard.press('ArrowDown'); await wait(p, 500);
  await p.keyboard.press('ArrowDown'); await wait(p, 500);
  await p.keyboard.press('ArrowDown'); await wait(p, 700);
  await p.keyboard.press('Escape'); await wait(p, 900);
  await p.keyboard.press('ArrowRight'); await wait(p, 600);
  await p.keyboard.press('ArrowDown'); await wait(p, 600);
  await p.keyboard.press('ArrowDown'); await wait(p, 900);
  await p.keyboard.press('Escape'); await wait(p, 700);
  await p.keyboard.press('ArrowRight'); await wait(p, 900);
  // Hover with a mouse: opens after a short intent delay
  await p.mouse.move(640, 500); await wait(p, 300);
  const t = await p.getByRole('button', { name: 'Trips', exact: true }).boundingBox();
  await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 18 }); await wait(p, 1300);
  const r = await p.getByRole('button', { name: 'About', exact: true }).boundingBox();
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 14 }); await wait(p, 1200);
  await p.mouse.move(640, 700, { steps: 14 }); await wait(p, 1200);
});

const phone = await take('phone', { width: 390, height: 800 }, async (p) => {
  await p.goto(BASE + '/');
  await wait(p, 1600);
  const tap = async (loc, ms = 900) => { const b = await loc.boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 }); await wait(p, 150); await loc.click(); await wait(p, ms); };
  await tap(p.getByRole('button', { name: 'Menu', exact: true }), 1100);
  await tap(p.locator('#site-menu').getByRole('button', { name: 'Trips', exact: true }), 1400);
  await tap(p.locator('#site-menu').getByRole('button', { name: 'Trips', exact: true }), 600);
  await tap(p.locator('#site-menu').getByRole('button', { name: 'Rent gear', exact: true }), 1300);
  await p.keyboard.press('Escape'); await wait(p, 1000);
  await tap(p.getByRole('button', { name: 'Menu', exact: true }), 900);
  await tap(p.locator('#site-menu').getByRole('link', { name: 'Journal' }), 1800);
});

// Phone take centred on a canvas-coloured 1280x800 frame, then both joined.
const mp4 = join(OUT, 'pandu-demo.mp4');
const gif = join(OUT, 'pandu-demo.gif');
execFileSync(FF, ['-y', '-loglevel', 'error',
  '-ss', '0.6', '-i', desktop, '-ss', '0.6', '-i', phone,
  '-filter_complex',
  '[0:v]fps=30,setsar=1[a];[1:v]fps=30,pad=1280:800:(ow-iw)/2:0:color=0xeee5d6,setsar=1[b];[a][b]concat=n=2:v=1:a=0[v]',
  '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '27', '-preset', 'slow', '-movflags', '+faststart', mp4]);
execFileSync(FF, ['-y', '-loglevel', 'error', '-i', mp4, '-vf',
  'fps=10,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', gif]);
execFileSync(FF, ['-y', '-loglevel', 'error', '-ss', '4.2', '-i', mp4, '-frames:v', '1', join(TMP, 'poster.png')]);
execFileSync('cwebp', ['-quiet', '-q', '80', join(TMP, 'poster.png'), '-o', join(OUT, 'pandu-demo-poster.webp')]);
await browser.close();
for (const f of ['pandu-demo.mp4', 'pandu-demo.gif', 'pandu-demo-poster.webp']) console.log(f, (statSync(join(OUT, f)).size / 1024).toFixed(0) + ' KB');
