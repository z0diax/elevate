// Optional real Chromium test; no browser/test-library dependencies are installed.
// Set CHROME_PATH if Chrome/Edge is not at a standard Windows path.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, existsSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(path => path && existsSync(path));
if (!chrome) throw Error('Set CHROME_PATH to a Chromium executable.');
const temporary = mkdtempSync(join(tmpdir(), 'praise-mobile-layout-'));
const javascript = (await build({ entryPoints: [join(root, 'tests/mobile_layout_fixture.tsx')], bundle: true, write: false, format: 'iife', loader: { '.png': 'dataurl' } })).outputFiles[0].text;
const cssFile = readdirSync(join(root, 'dist/assets')).find(name => name.endsWith('.css'));
const css = readFileSync(join(root, 'dist/assets', cssFile));
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(javascript); }
  else if (request.url === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); }
  else response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${join(temporary, 'profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
const delay = milliseconds => new Promise(ok => setTimeout(ok, milliseconds));
try {
  const activePort = join(temporary, 'profile/DevToolsActivePort');
  let port;
  for (let count = 0; count < 100; count++) {
    try {
      const candidate = readFileSync(activePort, 'utf8').split('\n')[0].trim();
      if (/^[0-9]+$/.test(candidate)) { port = candidate; break; }
    } catch { /* Chromium can briefly lock the file while writing it on Windows. */ }
    await delay(100);
  }
  if (!port) throw Error('Chromium debugging port did not become available.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(10000) })).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(ok => socket.addEventListener('open', ok, { once: true }));
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const result = JSON.parse(event.data);
    if (result.id && pending.has(result.id)) { const { ok, fail } = pending.get(result.id); pending.delete(result.id); result.error ? fail(Error(result.error.message)) : ok(result.result); }
  });
  const command = (method, params = {}) => new Promise((ok, fail) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); fail(Error('Timed out: ' + method)); }, 10000); pending.set(id, { ok: result => { clearTimeout(timer); ok(result); }, fail: error => { clearTimeout(timer); fail(error); } }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const click = async selector => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100); };
  const set = async (selector, value) => {
    await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await delay(50);
  };
  await command('Page.enable');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  const navigate = async (view, width, height = 844) => {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await command('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?view=${view}` });
    for (let count = 0; count < 60 && !await evaluate('!!document.querySelector("#root button")'); count++) await delay(100);
    await delay(150);
  };
  const fits = async label => {
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, label + ' page overflow');
    const overflow = await evaluate(`Array.from(document.querySelectorAll('button, input:not([type=checkbox]), select, [data-mobile-list] article')).filter(el => el.getClientRects().length && !el.closest('[inert]')).filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(el => el.textContent?.trim().slice(0, 60) || el.tagName)`);
    assert.deepEqual(overflow, [], label + ' clipped controls');
  };
  const clickText = async text => {
    await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.getClientRects().length && el.textContent.trim() === ${JSON.stringify(text)}).click()`);
    await delay(100);
  };
  for (const width of [320, 390, 768, 1280]) {
    for (const view of ['login', 'signup', 'password', 'overview', 'awards', 'offices', 'users', 'reports']) {
      await navigate(view, width);
      await fits(`${view} at ${width}`);
      if (width < 1280 && ['overview', 'offices', 'users', 'reports'].includes(view)) {
        assert.equal(await evaluate(`!!Array.from(document.querySelectorAll('[data-mobile-list]')).find(el => el.getClientRects().length)`), true, 'mobile cards visible');
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('table')).some(el => el.getClientRects().length)`), false, 'wide tables hidden');
      }
      if (width < 768 && view === 'login') assert.ok(await evaluate('document.querySelector("input[type=email]").getBoundingClientRect().bottom < innerHeight'), 'login input visible without scrolling');
      if (view === 'password') {
        await click('button[aria-label="Show current password"]');
        assert.equal(await evaluate('document.querySelector("input").type'), 'text');
        await click('button[aria-label="Hide current password"]');
        assert.equal(await evaluate('document.querySelector("input").type'), 'password');
      }
      if (view === 'users' && width < 768) {
        await clickText('Change role');
        await fits('role dialog');
        await set('input[type=search]', 'OFF1');
        assert.equal(await evaluate('document.querySelectorAll("fieldset input[type=checkbox]").length'), 3, 'office code filter works');
        await clickText('Cancel');
        await clickText('Create User');
        await fits('create user dialog');
        await clickText('Cancel');
      }
      if (view === 'offices' && width < 768) {
        await clickText('Add Department');
        await fits('office dialog');
        await clickText('Cancel');
        await clickText('Next');
        assert.equal(await evaluate('document.querySelectorAll("[data-mobile-list=offices] article").length'), 2, 'pagination applies to cards');
      }
      if (view === 'reports' && width < 768) {
        await click('#mobile-sidebar-toggle-btn');
        assert.equal(await evaluate('document.body.style.overflow'), 'hidden');
        await click('[aria-label="Close navigation"]');
        await click('#header-notification-bell-btn');
        await fits('notifications');
        await click('#user-account-menu-btn');
        await fits('account menu');
        await click('#user-account-menu-btn');
      }
      if ([320, 390, 1280].includes(width) && ['login', 'users', 'reports'].includes(view)) {
        writeFileSync(join(temporary, `${view}-${width}.png`), Buffer.from((await command('Page.captureScreenshot', { captureBeyondViewport: true })).data, 'base64'));
      }
      console.log(`PASS: ${view} at ${width}px`);
    }
  }
  await navigate('users', 390, 400);
  await clickText('Create User');
  await fits('landscape create user');
  assert.equal(await evaluate(`(() => { const panel = Array.from(document.querySelectorAll('h3')).find(el => el.textContent === 'Create User Account').parentElement; return panel.getBoundingClientRect().height <= innerHeight; })()`), true, 'dialog fits short viewport');
  console.log('PASS: phone/tablet/desktop layouts, phone actions, office search/pagination, password visibility, navigation and short dialogs.');
  console.log(`Review artifacts: ${temporary}`);
} finally {
  socket?.close(); browser.kill(); server.closeAllConnections(); await new Promise(ok => server.close(ok));
}
