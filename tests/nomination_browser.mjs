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
const temporary = mkdtempSync(join(tmpdir(), 'praise-nomination-browser-'));
const javascript = (await build({ entryPoints: [join(root, 'tests/nomination_browser_fixture.tsx')], bundle: true, write: false, format: 'iife' })).outputFiles[0].text;
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
  for (let count = 0; count < 100 && !existsSync(activePort); count++) await delay(100);
  const port = readFileSync(activePort, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(ok => socket.addEventListener('open', ok, { once: true }));
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const result = JSON.parse(event.data);
    if (result.id && pending.has(result.id)) { const { ok, fail } = pending.get(result.id); pending.delete(result.id); result.error ? fail(Error(result.error.message)) : ok(result.result); }
  });
  const command = (method, params = {}) => new Promise((ok, fail) => { const id = ++sequence; pending.set(id, { ok, fail }); socket.send(JSON.stringify({ id, method, params })); });
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
  await command('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  for (let count = 0; count < 100 && !await evaluate('!!document.querySelector("#wizard-next-btn")'); count++) await delay(100);
  assert.equal(await evaluate('document.querySelector("section input").value'), 'Jack Doe');
  assert.equal(await evaluate('Array.from(document.querySelectorAll("option")).some(option => option.textContent.includes("Inactive Office"))'), false);
  await set('input[placeholder="e.g. Juan P. Dela Cruz"]', 'Jane Doe');
  await set('input[placeholder="e.g. Administrative Officer IV / BHW"]', 'Officer');
  await set('section select', 'hr'); // nominator office remains distinct from nominee
  await set('input[type="tel"]', '09000000000');
  await set('input[type="email"]', 'jane@example.invalid');
  await evaluate('document.querySelectorAll("select")[2].id = "nominee-office-test"');
  await set('#nominee-office-test', 'cad');
  await click('#wizard-next-btn');
  await set('textarea:nth-of-type(1)', 'A thorough nomination justification with concrete evidence.');
  await evaluate('document.querySelectorAll("textarea")[1].id = "accomplishments-test"; document.querySelectorAll("textarea")[2].id = "narrative-test"');
  await set('#accomplishments-test', 'Meaningful accomplishments and measurable public impact.');
  await set('#narrative-test', 'Supporting evidence and background.');
  await click('#wizard-next-btn'); await click('#wizard-next-btn');
  await click('#wizard-submit-btn');
  assert.equal(await evaluate('window.nominationBrowser.submissions'), 0, 'unsigned submission blocked');
  await evaluate('document.querySelector("canvas").scrollIntoView({block:"center"})');
  const rect = await evaluate('(() => { const r = document.querySelector("canvas").getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()');
  const draw = async (pointerType = 'mouse') => {
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', pointerType, x: rect.x + 20, y: rect.y + 30, button: 'left', clickCount: 1 });
    for (const [x, y] of [[60, 80], [100, 40], [160, 100], [200, 50]]) await command('Input.dispatchMouseEvent', { type: 'mouseMoved', pointerType, x: rect.x + x, y: rect.y + y, button: 'left', buttons: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', pointerType, x: rect.x + 200, y: rect.y + 50, button: 'left', clickCount: 1 });
    await delay(100);
  };
  await draw(); assert.ok(await evaluate('!!document.querySelector("svg[aria-label]")'));
  await evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Clear signature").click()'); await delay(100);
  assert.equal(await evaluate('!!document.querySelector("svg[aria-label]")'), false);
  await draw('pen');
  await click('input[type="checkbox"]');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(100);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'mobile form fits viewport');
  await command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await evaluate('document.querySelector("canvas").scrollIntoView({block:"center"})');
  const touchRect = await evaluate('(() => { const r = document.querySelector("canvas").getBoundingClientRect(); return {x:r.x,y:r.y}; })()');
  await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchRect.x + 80, y: touchRect.y + 25, id: 1 }] });
  await command('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchRect.x + 120, y: touchRect.y + 60, id: 1 }] });
  await command('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchRect.x + 160, y: touchRect.y + 25, id: 1 }] });
  await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await delay(100);
  assert.equal(await evaluate('document.querySelector("input[type=checkbox]").checked'), false, 'changed signature requires fresh confirmation');
  await click('input[type="checkbox"]');

  writeFileSync(join(temporary, 'review-mobile.png'), Buffer.from((await command('Page.captureScreenshot', { captureBeyondViewport: true })).data, 'base64'));
  await click('#wizard-submit-btn');
  assert.equal(await evaluate('window.nominationBrowser.finalized'), 1);
  await command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: temporary });
  await evaluate('window.generateNominationPdf()');
  for (let count = 0; count < 100 && !existsSync(join(temporary, 'PRAISE-2026-BROWSER_Summary_Dossier.pdf')); count++) await delay(100);
  const pdf = readFileSync(join(temporary, 'PRAISE-2026-BROWSER_Summary_Dossier.pdf'), 'latin1');
  assert.match(pdf, /NOMINATOR ELECTRONIC SIGNATURE/);
  assert.match(pdf, /Jack Doe/); assert.match(pdf, /Jane Doe/);
  assert.match(pdf, /2026-10-08 10:30:00/); assert.match(pdf, /\/Subtype \/Image/);
  console.log('PASS: mouse/touch/stylus signatures, clear/redraw, unsigned blocking, distinct offices, responsive review and signed Form A1 PDF.');
  console.log(`Review artifacts: ${temporary}`);
} finally {
  socket?.close(); browser.kill(); await new Promise(ok => server.close(ok));
  // Keep review artifacts; remove only Chromium's disposable profile.
  await delay(300);
  const profile = resolve(temporary, 'profile');
  if (profile !== join(resolve(temporary), 'profile')) throw Error('Invalid disposable browser profile path.');
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chromium may still be releasing files. */ }
}
