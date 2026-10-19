#!/usr/bin/env node
// Real-browser checks for Pandu and the demo site.
//
//   node tools/check.mjs [base-url] [--browsers=chromium,firefox,webkit] [--shots]
//
// Default base URL is http://localhost:4321 (npm run dev). Uses the Playwright that
// ships with playwright-cli unless PLAYWRIGHT_PATH points elsewhere.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PW = process.env.PLAYWRIGHT_PATH || '/Users/luqman/.local/lib/node_modules/@playwright/cli/node_modules/playwright/index.mjs';
const pw = await import(PW);
const args = process.argv.slice(2);
const BASE = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:4321').replace(/\/$/, '');
const BROWSERS = (args.find((a) => a.startsWith('--browsers='))?.split('=')[1] || 'chromium,firefox,webkit').split(',');
const SHOTS = args.includes('--shots');
const AXE = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const PAGES = ['/', '/trips/', '/trips/gua-tempurung/', '/trips/kinta-valley/', '/trips/gunung-korbu/', '/trips/royal-belum/',
  '/trips/mossy-forest/', '/trips/taman-negara/', '/trips/kinabalu/', '/trips/calendar/', '/trips/grades/', '/trips/private-groups/',
  '/rent/', '/rent/shelter/', '/rent/packs/', '/rent/rain-and-cold/', '/rent/how-it-works/', '/about/', '/about/guides/', '/about/safety/',
  '/journal/', '/contact/', '/book/', '/credits/', '/pandu/', '/pandu/before-after/', '/pandu/example/'];

const results = [];
let fails = 0;
function ok(browser, name, pass, detail = '') {
  results.push({ browser, name, pass, detail });
  if (!pass) fails++;
  console.log(`${pass ? '  ok ' : 'FAIL '} [${browser}] ${name}${detail ? ' — ' + detail : ''}`);
}
const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) + ` <${a.tagName.toLowerCase()}>` : '';
});
const expanded = (page, name) => page.getByRole('button', { name, exact: true }).getAttribute('aria-expanded');

for (const name of BROWSERS) {
  // "chrome" / "msedge" run the installed branded browser through Playwright's Chromium driver.
  const branded = name === 'chrome' || name === 'msedge';
  const browser = await (branded ? pw.chromium.launch({ channel: name }) : pw[name].launch());
  const B = name;

  // ---------- Every page: console, status, aria-current, overflow ----------
  for (const [w, h] of [[1440, 900], [320, 640]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    let overflow = [], bad = [], current = [];
    for (const path of PAGES) {
      const res = await page.goto(BASE + path, { waitUntil: 'load' });
      if (!res || res.status() !== 200) bad.push(`${path} ${res && res.status()}`);
      const ow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (ow > 0) overflow.push(`${path} +${ow}px`);
      if (w === 1440 && path !== '/pandu/example/') {
        const cur = await page.evaluate(() => [...document.querySelectorAll('.pandu [aria-current="page"]')].map((a) => a.getAttribute('href')));
        const expectOne = ['/credits/', '/pandu/', '/pandu/before-after/'].includes(path) ? 0 : 1;
        if (cur.length !== expectOne || (expectOne && cur[0] !== path)) current.push(`${path}: ${JSON.stringify(cur)}`);
      }
    }
    ok(B, `${w}px: all ${PAGES.length} pages return 200`, !bad.length, bad.join(', '));
    ok(B, `${w}px: no horizontal overflow`, !overflow.length, overflow.join(', '));
    ok(B, `${w}px: console clean on every page`, !errors.length, errors.slice(0, 3).join(' | '));
    if (w === 1440) ok(B, 'aria-current="page" marks exactly the current route', !current.length, current.join('; '));
    await ctx.close();
  }

  // ---------- Desktop keyboard walkthrough ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/trips/gua-tempurung/');
    // Safari/WebKit only tabs to links with this preference on; emulate by focusing the first element.
    await page.locator('.skip-link').focus();
    const order = [await active(page)];
    for (let i = 0; i < 9; i++) { await page.keyboard.press(B === 'webkit' ? 'Alt+Tab' : 'Tab'); order.push(await active(page)); }
    const want = ['Skip to content', 'Pandu', 'See before and after', 'Lereng', 'Trips', 'Rent gear', 'About', 'Journal', 'Contact', 'Book a trip'];
    ok(B, 'tab order: skip link, strip links, brand, Trips, Rent gear, About, Journal, Contact, Book a trip', want.every((t, i) => order[i].startsWith(t)), order.join(' → '));

    await page.getByRole('button', { name: 'Trips', exact: true }).focus();
    await page.keyboard.press('Enter');
    ok(B, 'Enter opens Trips (aria-expanded=true)', (await expanded(page, 'Trips')) === 'true');
    ok(B, 'mega panel visible', await page.locator('#panel-trips').isVisible());
    await page.keyboard.press('Space');
    ok(B, 'Space closes Trips', (await expanded(page, 'Trips')) === 'false');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(60);
    ok(B, 'ArrowDown on trigger opens and focuses first link', (await expanded(page, 'Trips')) === 'true' && (await active(page)).startsWith('Gua Tempurung'), await active(page));
    await page.keyboard.press('ArrowDown');
    ok(B, 'ArrowDown moves to next link in panel', (await active(page)).startsWith('Kinta Valley'), await active(page));
    await page.keyboard.press('End');
    ok(B, 'End jumps to last link in panel', (await active(page)).startsWith('Kinta Valley loop'), await active(page));
    await page.keyboard.press('Escape');
    ok(B, 'Esc closes panel and returns focus to trigger', (await expanded(page, 'Trips')) === 'false' && (await active(page)).startsWith('Trips <button'), await active(page));
    await page.keyboard.press('ArrowRight');
    ok(B, 'ArrowRight moves to next top-level item', (await active(page)).startsWith('Rent gear'), await active(page));
    await page.keyboard.press('End');
    ok(B, 'End moves to last top-level item', (await active(page)).startsWith('Contact'), await active(page));
    await page.keyboard.press('ArrowRight');
    ok(B, 'ArrowRight wraps to first item', (await active(page)).startsWith('Trips'), await active(page));
    // Tab through an open dropdown and out of it: it closes, focus is not trapped.
    await page.getByRole('button', { name: 'About', exact: true }).focus();
    await page.keyboard.press('Enter');
    for (let i = 0; i < 3; i++) await page.keyboard.press(B === 'webkit' ? 'Alt+Tab' : 'Tab');
    ok(B, 'Tab walks through the About links in order', (await active(page)).startsWith('Safety and permits'), await active(page));
    await page.keyboard.press(B === 'webkit' ? 'Alt+Tab' : 'Tab');
    ok(B, 'Tabbing out of a panel closes it (no trap)', (await expanded(page, 'About')) === 'false' && (await active(page)).startsWith('Journal'), await active(page));
    // Focus ring visible
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth);
    ok(B, 'visible focus ring on keyboard focus', /solid 2px/.test(ring), ring);
    // Click outside closes
    await page.getByRole('button', { name: 'Rent gear', exact: true }).click();
    await page.mouse.click(700, 700);
    ok(B, 'click outside closes an open panel', (await expanded(page, 'Rent gear')) === 'false');
    // Hover intent
    const box = await page.getByRole('button', { name: 'About', exact: true }).boundingBox();
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.waitForTimeout(40);
    const early = await expanded(page, 'About');
    await page.waitForTimeout(250);
    ok(B, 'hover opens after the intent delay, not instantly', early === 'false' && (await expanded(page, 'About')) === 'true', `at 40ms ${early}`);
    await page.mouse.move(700, 800);
    await page.waitForTimeout(500);
    ok(B, 'pointer leaving closes a hover-opened panel', (await expanded(page, 'About')) === 'false');
    if (SHOTS && B === 'chromium') {
      await page.goto(BASE + '/');
      await page.waitForTimeout(1400);
      await page.getByRole('button', { name: 'Trips', exact: true }).focus();
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);
      mkdirSync(join(ROOT, 'docs/shots'), { recursive: true });
      await page.screenshot({ path: join(ROOT, 'docs/shots/desktop-mega-menu.png') });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Rent gear', exact: true }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(ROOT, 'docs/shots/desktop-dropdown.png'), clip: { x: 0, y: 0, width: 1440, height: 560 } });
    }
    await ctx.close();
  }

  // ---------- Mobile drawer at 390 and 320 ----------
  for (const w of [390, 320]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 760 }, hasTouch: true, isMobile: B !== 'firefox' });
    const page = await ctx.newPage();
    await page.goto(BASE + '/');
    const toggle = page.getByRole('button', { name: 'Menu', exact: true });
    ok(B, `${w}px: Menu toggle visible with aria-expanded=false`, (await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false');
    ok(B, `${w}px: toggle aria-controls points at the drawer`, (await toggle.getAttribute('aria-controls')) === 'site-menu');
    await toggle.click();
    await page.waitForTimeout(150);
    ok(B, `${w}px: drawer opens, aria-expanded=true`, (await page.locator('#site-menu').isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'true');
    ok(B, `${w}px: focus moves into the drawer (first item)`, (await active(page)).startsWith('Trips'), await active(page));
    const st = await page.evaluate(() => ({ lock: document.documentElement.classList.contains('pandu-lock'), main: document.querySelector('main').inert, footer: document.querySelector('footer').inert, brand: document.querySelector('.pandu__brand').inert, drawerW: document.getElementById('site-menu').getBoundingClientRect().width }));
    ok(B, `${w}px: page behind is inert and scroll-locked`, st.lock && st.main && st.footer && st.brand, JSON.stringify(st));
    ok(B, `${w}px: drawer fits the screen`, st.drawerW <= w, `${st.drawerW}px`);
    await page.getByRole('button', { name: 'Trips', exact: true }).click();
    if (SHOTS && B === 'chromium' && w === 390) { await page.waitForTimeout(300); await page.screenshot({ path: join(ROOT, 'docs/shots/mobile-drawer.png') }); }
    ok(B, `${w}px: section expands as an accordion`, (await expanded(page, 'Trips')) === 'true' && (await page.locator('#site-menu').getByRole('link', { name: /Gua Tempurung cave run/ }).isVisible()));
    await page.getByRole('button', { name: 'Rent gear', exact: true }).click();
    ok(B, `${w}px: several accordions can be open together`, (await expanded(page, 'Trips')) === 'true' && (await expanded(page, 'Rent gear')) === 'true');
    // Tab cycles inside the drawer
    await page.locator('#site-menu').getByRole('link', { name: 'Book a trip' }).focus();
    await page.keyboard.press(B === 'webkit' ? 'Alt+Tab' : 'Tab');
    ok(B, `${w}px: Tab from the last item wraps to the first (trapped while modal)`, (await active(page)).startsWith('Close menu'), await active(page));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    ok(B, `${w}px: Esc closes drawer, focus returns to Menu`, (await toggle.getAttribute('aria-expanded')) === 'false' && (await active(page)).startsWith('Menu'), await active(page));
    const after = await page.evaluate(() => ({ lock: document.documentElement.classList.contains('pandu-lock'), inert: document.querySelectorAll('[inert]').length }));
    ok(B, `${w}px: inert and scroll lock removed on close`, !after.lock && after.inert === 0, JSON.stringify(after));
    await toggle.click();
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: 'Close menu' }).click();
    ok(B, `${w}px: Close button closes and returns focus`, (await toggle.getAttribute('aria-expanded')) === 'false' && (await active(page)).startsWith('Menu'), await active(page));
    await toggle.click();
    await page.waitForTimeout(250);
    await page.mouse.click(5, 380);
    await page.waitForTimeout(100);
    if (w > 340) ok(B, `${w}px: tapping the scrim closes the drawer`, (await toggle.getAttribute('aria-expanded')) === 'false');
    else await page.keyboard.press('Escape');
    // Following a link closes the drawer and navigates
    await toggle.click();
    await page.waitForTimeout(150);
    await page.locator('#site-menu').getByRole('link', { name: 'Journal' }).click();
    await page.waitForURL('**/journal/');
    ok(B, `${w}px: drawer link navigates to its route`, page.url().endsWith('/journal/'));
    await ctx.close();
  }

  // ---------- Without JavaScript ----------
  {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/');
    await page.getByRole('link', { name: 'Trips', exact: true }).first().focus();
    ok(B, 'no JS: Trips is a link to /trips/ and its panel opens on focus', (await page.getByRole('link', { name: 'Trips', exact: true }).first().getAttribute('href')) === '/trips/' && await page.locator('#panel-trips').isVisible());
    const m = await (await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 760 } })).newPage();
    await m.goto(BASE + '/');
    await m.getByRole('link', { name: 'Menu', exact: true }).click();
    await m.waitForTimeout(400);
    ok(B, 'no JS: Menu link opens the drawer with :target', await m.locator('#site-menu').isVisible() && (await m.locator('#site-menu').boundingBox()).x < 390);
    await m.context().close();
    await ctx.close();
  }

  // ---------- axe-core (Chromium only; same DOM everywhere) ----------
  if (B === 'chromium') {
    const viol = [];
    for (const [w, h] of [[1440, 900], [390, 760]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      for (const path of PAGES) {
        await page.goto(BASE + path);
        if (path === '/' ) {
          // also audit with a panel / the drawer open
          if (w > 900) await page.getByRole('button', { name: 'Trips', exact: true }).click();
          else await page.getByRole('button', { name: 'Menu', exact: true }).click();
          await page.waitForTimeout(200);
        }
        await page.addScriptTag({ content: AXE });
        const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(' ')}`));
        r.forEach((x) => viol.push(`${w}px ${path} ${x}`));
      }
      await ctx.close();
    }
    ok(B, 'axe-core WCAG 2.2 AA + best practice: no violations on any page (desktop and phone, menu open)', !viol.length, viol.slice(0, 40).join('\n      '));
  }

  await browser.close();
}

mkdirSync(join(ROOT, '.playwright-cli'), { recursive: true });
writeFileSync(join(ROOT, '.playwright-cli/check-results.json'), JSON.stringify({ base: BASE, date: new Date().toISOString(), results }, null, 2));
console.log(`\n${results.length - fails}/${results.length} checks passed against ${BASE}`);
process.exit(fails ? 1 : 0);
