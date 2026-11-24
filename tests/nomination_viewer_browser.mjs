// Optional real Chromium test; no browser/test-library dependencies are installed.
// Set CHROME_PATH if Chrome/Edge is not at a standard Windows path.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, existsSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';

const root = resolve(import.meta.dirname, '..');
const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(path => path && existsSync(path));
if (!chrome) throw Error('Set CHROME_PATH to a Chromium executable.');
const temporary = mkdtempSync(join(tmpdir(), 'praise-viewer-browser-'));
const javascript = (await build({ entryPoints: [join(root, 'tests/nomination_viewer_fixture.tsx')], bundle: true, minify: true, write: false, format: 'iife', loader: { '.png': 'dataurl' } })).outputFiles[0].text;
const cssFile = readdirSync(join(root, 'dist/assets')).find(name => name.endsWith('.css'));
const css = readFileSync(join(root, 'dist/assets', cssFile));
const previewPdf = Buffer.from(new jsPDF().output('arraybuffer'));
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(javascript); }
  else if (request.url === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); }
  else if (request.url.startsWith('/preview.png')) { response.setHeader('Content-Type', 'image/png'); response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlV8AAAAASUVORK5CYII=', 'base64')); }
  else if (request.url.startsWith('/preview.pdf')) { response.setHeader('Content-Type', 'application/pdf'); response.end(previewPdf); }
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
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(ok => socket.addEventListener('open', ok, { once: true }));
  let sequence = 0;
  const pending = new Map();
  const completedDownloads = new Set();
  socket.addEventListener('message', event => {
    const result = JSON.parse(event.data);
    if (result.method === 'Browser.downloadProgress' && result.params.state === 'completed') completedDownloads.add(result.params.guid);
    if (result.id && pending.has(result.id)) { const { ok, fail } = pending.get(result.id); pending.delete(result.id); result.error ? fail(Error(result.error.message)) : ok(result.result); }
  });
  const command = (method, params = {}) => new Promise((ok, fail) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); fail(Error(`Browser did not respond to ${method}`)); }, 30000);
    pending.set(id, { ok: result => { clearTimeout(timeout); ok(result); }, fail: error => { clearTimeout(timeout); fail(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
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

  const visibleFormButton = `Array.from(document.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === 'View nomination form PRAISE-VIEWER' && button.getBoundingClientRect().height > 0)`;
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); }
    throw Error(`Timed out: ${expression}`);
  };
  await waitFor('!!window.viewerTest');
  const open = async () => {
    await waitFor(`!!(${visibleFormButton})`);
    await evaluate(`(${visibleFormButton}).focus()`);
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await delay(30);
    assert.match(await evaluate('document.querySelector("[role=dialog]").textContent'), /Loading nomination form/);
    await waitFor('!!document.querySelector("[role=dialog]")?.textContent.includes("Latest Nominee Record")');
  };
  const selectTab = async label => {
    await evaluate(`Array.from(document.querySelectorAll('[role=tab]')).find(tab => tab.textContent.trim()===${JSON.stringify(label)}).click()`);
    await waitFor(`document.querySelector('[role=tab][aria-selected="true"]').textContent.trim()===${JSON.stringify(label)}`);
    assert.equal(await evaluate('document.querySelectorAll("[role=tabpanel]:not([hidden])").length'), 1);
    assert.equal(await evaluate('(() => { const tab=document.querySelector("[role=tab][aria-selected=true]"); const panel=document.getElementById(tab.getAttribute("aria-controls")); return panel.getAttribute("aria-labelledby")===tab.id && !panel.hidden; })()'), true, 'tabs and panels have matching labels');
  };
  const close = async () => {
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await delay(100);
    assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'), 0);
    assert.equal(await evaluate('document.activeElement.textContent'), 'PRAISE-VIEWER');
    assert.equal(await evaluate('document.body.style.overflow'), '');
  };
  for (const [role, screen] of [['ADMINISTRATOR',''], ['SECRETARIAT',''], ['HEAD_OF_OFFICE',''], ['EVALUATOR',''], ['NOMINEE',''], ['SECRETARIAT','deliberation'], ['NOMINEE','submission']]) {
    for (const width of [1100, 768, 390, 320]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 640 });
      await evaluate(`window.viewerTest.render(${JSON.stringify(role)}, ${JSON.stringify(screen)})`);
      await delay(100);
      assert.equal(await evaluate('Array.from(document.querySelectorAll("button")).some(button => button.textContent === "View Nomination Form")'), false, 'no redundant viewer buttons');
      const rows = await evaluate('Array.from(document.querySelectorAll("tbody, article")).map(row => row.textContent).join(" ")');
      for (const detail of ['Original Nominator', 'Nominated by Others', 'Filing Account']) assert.ok(!rows.includes(detail), `${detail} stays inside viewer`);
      await waitFor(`!!(${visibleFormButton})`);
      const referenceHeight = await evaluate(`(${visibleFormButton}).getBoundingClientRect().height`);
      assert.ok(width < 1024 ? referenceHeight >= 44 : referenceHeight <= 24, width < 1024 ? 'reference has a touch target' : 'desktop reference remains compact');
      assert.equal(await evaluate(`(${visibleFormButton}).getAttribute('aria-haspopup')`), 'dialog');
      const before = await evaluate('window.viewerTest.state.calls');
      await open();
      assert.equal(await evaluate('window.viewerTest.state.calls'), before + 1, 'one fresh form request per opening');
      assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'), 1, 'workflow modal was not also opened');
      assert.equal(await evaluate('document.querySelector("[role=tab][aria-selected=true]").textContent.trim()'), 'Overview', 'opens on Overview');
      assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("[role=tab]")).map(tab => tab.textContent.trim())'), ['Overview', 'Details', 'Justification', 'Documents', 'Submission']);
      for (const label of ['Details', 'Justification', 'Documents', 'Submission', 'Overview']) {
        await selectTab(label);
        assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'), 1, 'switching tabs retains modal');
        assert.equal(await evaluate('document.querySelector("[role=dialog] main").scrollTop'), 0, 'new tab starts at top');
        const panel = await evaluate('document.querySelector("[role=tabpanel]:not([hidden])").textContent');
        if (label==='Details') { assert.ok(panel.includes('EMP-42')); assert.ok(panel.includes('Nominator Information')); }
        if (label==='Justification') assert.ok(panel.includes('Long narrative\n'), 'narrative line breaks preserved');
        if (label==='Documents') assert.ok(panel.includes('Evidence PDF'));
        if (label==='Submission') assert.ok(panel.includes('Nomination history'));
        if (role==='NOMINEE' && !screen && [1100,390].includes(width)) writeFileSync(join(temporary, `tab-${label}-${width}.png`), Buffer.from((await command('Page.captureScreenshot')).data, 'base64'));
      }
      assert.equal(await evaluate('window.viewerTest.state.calls'), before+1, 'switching tabs does not refetch nomination');
      await evaluate('document.querySelector("[role=tab][aria-selected=true]").focus()');
      for (const [key, code, expected] of [['ArrowRight',39,'Details'], ['End',35,'Submission'], ['Home',36,'Overview'], ['ArrowLeft',37,'Submission'], ['ArrowRight',39,'Overview']]) {
        await command('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:code}); await delay(30);
        assert.equal(await evaluate('document.activeElement.textContent.trim()'), expected, 'keyboard navigation moves focus');
        assert.equal(await evaluate('document.querySelector("[role=tab][aria-selected=true]").textContent.trim()'), expected);
        assert.equal(await evaluate('Array.from(document.querySelectorAll("[role=tab]")).filter(tab => tab.tabIndex===0).length'), 1, 'roving tab stop');
      }
      await evaluate(`document.querySelector('[aria-label="Close nomination"]').focus()`);
      const content = await evaluate('document.querySelector("[role=dialog]").textContent');
      for (const section of ['Nomination Overview', 'Nominee Information', 'Nominator Information', 'Nomination Details', 'Supporting Documents', 'Submission Information', 'Nomination history']) assert.ok(content.includes(section));
      assert.equal(await evaluate('Array.from(document.querySelectorAll("[role=dialog] h3")).filter(heading => /^Nominee Information$|^Nominator Information$|^Nomination Details$|^Supporting Documents$|^Submission Information$/.test(heading.textContent)).length'), 5, 'five sections without duplicate headings');
      assert.ok(await evaluate('!!document.querySelector("[role=dialog] header").textContent.includes("City Government of Tacloban")'));
      assert.ok(content.includes('EMP-42')); assert.ok(content.includes('Latest authorized record'));
      if (role === 'EVALUATOR') { assert.match(content, /restricted during scoring/); assert.ok(!content.includes('Original Nominator')); }
      else { assert.ok(content.includes('Original Nominator')); assert.ok(content.includes('No electronic signature recorded')); }
      assert.equal(await evaluate('!!document.querySelector("[role=dialog] input, [role=dialog] textarea, [role=dialog] select")'), false, 'form is read-only');
      assert.equal(await evaluate('(() => { const el=document.querySelector("[role=dialog] main"); return el.scrollWidth <= el.clientWidth; })()'), true, 'long narrative fits modal width');
      assert.equal(await evaluate('(() => { const r=document.querySelector("[role=dialog]").getBoundingClientRect(); return r.width<=innerWidth && r.height<=innerHeight; })()'), true, 'responsive modal fits screen');
      if (role === 'NOMINEE' && !screen && width === 1100) {
        await evaluate('document.querySelector("[role=dialog] summary").click()');
        assert.ok(await evaluate('document.querySelector("#stage-progress-tracker").getBoundingClientRect().height > 0'), 'full workflow remains accessible');
        await evaluate('document.querySelector("[role=dialog] summary").click(); document.querySelector("[role=dialog] main").scrollTop=0');
      }
      writeFileSync(join(temporary, `form-top-${role}-${screen || 'dashboard'}-${width}.png`), Buffer.from((await command('Page.captureScreenshot')).data, 'base64'));
      await selectTab('Documents');
      await evaluate(`document.querySelector('[aria-label="Close nomination"]').focus()`);
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
      assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Download Evidence PDF', 'shift-tab traps focus');
      const headerTop = await evaluate('document.querySelector("[role=dialog] header").getBoundingClientRect().top');
      await selectTab('Justification');
      const tabsTop = await evaluate('document.querySelector("[role=tablist]").getBoundingClientRect().top');
      await evaluate('document.querySelector("[role=dialog] main").scrollTop = 800');
      assert.equal(await evaluate('document.querySelector("[role=tablist]").getBoundingClientRect().top'), tabsTop, 'tabs stay visible while content scrolls');
      assert.equal(await evaluate('document.querySelector("[role=dialog] header").getBoundingClientRect().top'), headerTop, 'header remains visible when scrolling');
      assert.ok(await evaluate('document.querySelector("[role=dialog] header").getBoundingClientRect().bottom < innerHeight'));
      writeFileSync(join(temporary, `form-${role}-${screen || 'dashboard'}-${width}.png`), Buffer.from((await command('Page.captureScreenshot')).data, 'base64'));
      await selectTab('Documents');
      await evaluate('Array.from(document.querySelectorAll("[role=dialog] button")).find(button => button.textContent.trim()==="View document").click()');
      await delay(100);
      await waitFor('document.querySelector("#document-viewer-modal-dialog img")?.naturalWidth > 0');
      assert.equal(await evaluate('!!document.querySelector("#document-viewer-modal-dialog textarea")'), false, 'no document mutation controls');
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await delay(100);
      assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'), 1, 'escape closes preview only');
      await evaluate('Array.from(document.querySelectorAll("[role=dialog] button")).filter(button => button.textContent.trim()==="View document").at(-1).click()');
      await delay(100);
      assert.ok(await evaluate('document.querySelector("#document-viewer-modal-dialog iframe")?.src.includes("/preview.pdf?preview=1")'), 'PDF preview preserved');
      assert.ok(await evaluate('Array.from(document.querySelectorAll("#document-viewer-modal-dialog a")).some(link => link.textContent.trim()==="Download" && link.href.endsWith("/preview.pdf"))'), 'document download preserved');
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await delay(100);
      if (role === 'NOMINEE' && !screen && [1100, 390].includes(width)) {
        writeFileSync(join(temporary, `form-documents-${width}.png`), Buffer.from((await command('Page.captureScreenshot')).data, 'base64'));
      }
      await close();
      writeFileSync(join(temporary, `table-${role}-${screen || 'dashboard'}-${width}.png`), Buffer.from((await command('Page.captureScreenshot')).data, 'base64'));
      await evaluate(`Array.from((${visibleFormButton}).closest('tr, article').querySelectorAll('p, h3, h4, td, div')).find(element => element.textContent==='Nominee Record').click()`);
      assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'), 0, 'nominee name is passive across all roles');
      if (role === 'NOMINEE') {
        assert.equal(await evaluate('Array.from(document.querySelectorAll("button")).filter(button => /^(Track nomination for |View nomination for )/.test(button.getAttribute("aria-label") || "")).length'), 0, 'nominee names do not open another modal');
        const row = await evaluate(`(${visibleFormButton}).closest('tr, article').textContent`);
        assert.ok(!row.includes('View nomination'), 'reference is the only viewing control');
        await evaluate(`Array.from((${visibleFormButton}).closest('tr, article').querySelectorAll('p, h3')).find(element => element.textContent==='Nominee Record').click()`);
        assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'), 0, 'plain name does not open a modal');
      }
    }
  }
  for (const width of [1100,390]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<640});
    await evaluate("window.viewerTest.state.status='Returned for Revision'; window.viewerTest.state.stage='Endorsement'; window.viewerTest.render('NOMINEE','submission')");
    await delay(100);
    await evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim()==="Correct & Resubmit" && button.getBoundingClientRect().height>0).click()');
    await waitFor('!!document.querySelector("[role=dialog]")');
    assert.match(await evaluate('document.querySelector("[role=dialog]").textContent'), /Correct and resubmit nomination/);
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); await delay(100);
    await evaluate("window.viewerTest.render('NOMINEE')"); await delay(100);
    const corrections = await evaluate('window.viewerTest.state.corrections');
    await evaluate('Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim()==="Review required changes" && button.getBoundingClientRect().height>0).click()');
    assert.equal(await evaluate('window.viewerTest.state.corrections'),corrections+1,'correction navigation preserved');
    assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'),0,'correction navigation does not open duplicate viewer');
  }
  for (const [status, stage] of [['Draft', 'Submitted'], ['Returned for Revision', 'Endorsement'], ['Incomplete', 'Document Verification'], ['Under Evaluation', 'Evaluation'], ['Approved', 'Final Decision'], ['Awarded', 'Awarded']]) {
    await evaluate(`window.viewerTest.state.status=${JSON.stringify(status)}; window.viewerTest.state.stage=${JSON.stringify(stage)}`);
    await open();
    assert.ok((await evaluate('document.querySelector("[role=dialog] header").textContent')).includes(status));
    assert.ok((await evaluate('document.querySelector("[role=dialog] main").textContent')).includes(stage));
    await close();
  }
  await evaluate('window.viewerTest.state.signed=true; window.viewerTest.state.longIdentity=true');
  await open();
  await selectTab('Details');
  await waitFor(`!!document.querySelector('svg[aria-label="Handwritten electronic signature"]')`);
  assert.equal(await evaluate('!!document.querySelector("[role=dialog] canvas")'), false, 'signature capture is never exposed');
  assert.equal(await evaluate('(() => { const el=document.querySelector("[role=dialog] main"); return el.scrollWidth<=el.clientWidth; })()'), true, 'long identities wrap');
  await evaluate(`document.querySelector('svg[aria-label="Handwritten electronic signature"]').scrollIntoView({block:"center"})`);
  writeFileSync(join(temporary, 'form-signed-mobile.png'), Buffer.from((await command('Page.captureScreenshot')).data, 'base64'));
  await close();
  await evaluate('window.viewerTest.state.signatureFail=true');
  await open();
  await selectTab('Details');
  await waitFor('!!document.querySelector("[role=alert]")');
  assert.equal(await evaluate(`!!document.querySelector('svg[aria-label="Handwritten electronic signature"]')`), false, 'failed signature never fabricates a signed record');
  await close();
  await evaluate('window.viewerTest.state.signed=false; window.viewerTest.state.signatureFail=false; window.viewerTest.state.longIdentity=false');
  await evaluate('window.viewerTest.state.legacy = true');
  await open();
  await selectTab('Justification');
  assert.match(await evaluate('document.querySelector("[role=tabpanel]:not([hidden])").textContent'), /No nomination narrative recorded/);
  await selectTab('Submission');
  assert.match(await evaluate('document.querySelector("[role=dialog]").textContent'), /No history is available/);
  assert.ok(!await evaluate('document.querySelector("[role=dialog]").textContent.includes("Invalid Date")'));
  writeFileSync(join(temporary, 'viewer-mobile.png'), Buffer.from((await command('Page.captureScreenshot')).data, 'base64'));
  await close();
  await evaluate('window.viewerTest.state.fail = true');
  await evaluate(`(${visibleFormButton}).click()`);
  await waitFor('!!document.querySelector("[role=alert]")');
  assert.match(await evaluate('document.querySelector("[role=alert]").textContent'), /Access denied/);
  assert.ok(!await evaluate('document.querySelector("[role=dialog]").textContent.includes("Nominee Record")'), 'failed fetch exposes no cached record');
  await evaluate('window.viewerTest.state.fail = false; Array.from(document.querySelectorAll("button")).find(button => button.textContent==="Try again").click()');
  await waitFor('!!document.querySelector("[role=dialog]")?.textContent.includes("Latest Nominee Record")');
  await close();
  await evaluate("window.viewerTest.state.legacy=false; window.viewerTest.mountViewer('viewer-record')");
  await waitFor('!!document.querySelector("[role=tab]")');
  await selectTab('Documents');
  await evaluate("window.viewerTest.mountViewer('viewer-other')");
  await waitFor('!!document.querySelector("[role=dialog]")?.textContent.includes("Other Nominee Record")');
  assert.equal(await evaluate('document.querySelector("[role=tab][aria-selected=true]").textContent.trim()'), 'Overview', 'different nomination resets tab');
  assert.ok(!(await evaluate('document.querySelector("[role=dialog]").textContent')).includes('Latest Nominee Record'));
  await evaluate(`document.querySelector('[aria-label="Close nomination"]').click()`);
  await delay(100);
  assert.equal(await evaluate('document.querySelectorAll("[role=dialog]").length'), 0, 'close button closes viewer');
  await command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: temporary, eventsEnabled: true });
  const downloadButton = `document.querySelector('[role=dialog] button[aria-label="Download nomination PDF"]')`;
  for (const role of ['ADMINISTRATOR', 'EVALUATOR', 'NOMINEE']) {
    await command('Emulation.setDeviceMetricsOverride', { width: role === 'ADMINISTRATOR' ? 1100 : 390, height: 844, deviceScaleFactor: 1, mobile: role !== 'ADMINISTRATOR' });
    await evaluate(`window.viewerTest.state.signed=true; window.viewerTest.render(${JSON.stringify(role)})`);
    await delay(100); await open();
    assert.ok(await evaluate(`!!${downloadButton}`), 'PDF download available from every tab');
    writeFileSync(join(temporary, `download-${role}.png`), Buffer.from((await command('Page.captureScreenshot')).data, 'base64'));
    const before = await evaluate('window.viewerTest.state.calls');
    const signatureBefore = await evaluate('window.viewerTest.state.signatureCalls');
    const downloadsBefore = completedDownloads.size;
    await evaluate(`${downloadButton}.click()`);
    await waitFor(`${downloadButton}.disabled`);
    await waitFor(`!${downloadButton}.disabled`);
    assert.equal(await evaluate('window.viewerTest.state.calls'), before + 1, 'download fetches current authorized record');
    assert.equal(await evaluate('window.viewerTest.state.signatureCalls'), signatureBefore + (role === 'EVALUATOR' ? 0 : 1), 'evaluators never request signature');
    assert.equal(await evaluate('!!document.querySelector("[role=dialog] [role=alert]")'), false);
    const target = join(temporary, 'PRAISE-VIEWER_Nomination_Form.pdf');
    for (let count = 0; count < 100 && completedDownloads.size === downloadsBefore; count++) await delay(100);
    assert.equal(completedDownloads.size, downloadsBefore + 1, 'browser completed the PDF download');
    const pdf = await PDFDocument.load(readFileSync(target));
    assert.ok(pdf.getPageCount() > 3, 'download includes form and both attachment types');
    writeFileSync(join(temporary, `nomination-${role}.pdf`), readFileSync(target));
    rmSync(target);
    await close();
  }
  await evaluate("window.viewerTest.render('NOMINEE'); window.viewerTest.state.signatureFail=true"); await delay(100); await open();
  await evaluate(`${downloadButton}.click()`);
  await waitFor('!!document.querySelector("[role=dialog] header [role=alert]")');
  assert.match(await evaluate('document.querySelector("[role=dialog] header [role=alert]").textContent'), /signature could not be loaded/);
  assert.equal(existsSync(join(temporary, 'PRAISE-VIEWER_Nomination_Form.pdf')), false, 'failed signature does not download incomplete PDF');
  await close();
  const visibleButton = label => `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(label)} && button.getBoundingClientRect().height > 0)`;
  const clickLabel = async label => { const expression = visibleButton(label); await waitFor(`!!(${expression})`); await evaluate(`(${expression}).click()`); };
  const positionInput = 'input[placeholder="e.g. Administrative Officer IV / BHW"]';
  const positionValue = `document.querySelector(${JSON.stringify(positionInput)}).value`;
  for (const [width, scope] of [[1360, 'both'], [390, 'attachments']]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
    await evaluate("window.viewerTest.revisionState.enabled=true; window.viewerTest.resetRevision(); window.viewerTest.render('ADMINISTRATOR')");
    await clickLabel('Require Nomination Revision');
    await waitFor('!!document.querySelector("[role=dialog] select")');
    assert.equal(await evaluate('document.querySelector("[role=dialog] select").value'), 'both');
    assert.match(await evaluate('document.querySelector("[role=dialog]").textContent'), /Filing Account/);
    await set('[role=dialog] select', scope);
    await set('[role=dialog] textarea', 'Correct the position and supporting evidence.');
    await clickLabel('Require Revision');
    await waitFor('!document.querySelector("[role=dialog]") && document.body.textContent.includes("Revision Required")');
    writeFileSync(join(temporary, `revision-admin-${width}.png`), Buffer.from((await command('Page.captureScreenshot')).data, 'base64'));
    await evaluate("window.viewerTest.render('SECRETARIAT')");
    assert.equal(await evaluate(`!!(${visibleButton('Require Nomination Revision')})`), false);
    assert.equal(await evaluate(`!!(${visibleButton('Cancel Revision Request')})`), false);
    await evaluate("window.viewerTest.revisionState.otherFiler=true; window.viewerTest.render('NOMINEE','submission')");
    await waitFor('!!document.querySelector("#submit-nomination-view")');
    assert.equal(await evaluate(`!!(${visibleButton('Edit Nomination')})`), false, 'a linked nominee cannot edit another account’s filing');
    await evaluate("window.viewerTest.revisionState.otherFiler=false; window.viewerTest.render('NOMINEE','submission')");
    await clickLabel('Edit Nomination');
    await waitFor('!!document.querySelector("#wizard-next-btn")');
    assert.match(await evaluate('document.querySelector("#nomination-wizard-container").textContent'), /Revise Nomination/);
    assert.match(await evaluate('document.querySelector("#nomination-wizard-container").textContent'), /Correct the position and supporting evidence/);
    assert.equal(await evaluate('document.querySelector("#award-category-select").matches(":disabled")'), scope === 'attachments');
    assert.equal(await evaluate(positionValue), 'Officer');
    if (scope === 'both') {
      await set(positionInput, 'Revised Officer');
      await clickLabel('Save & Close');
      await waitFor('!document.querySelector("#nomination-wizard-container")');
      await clickLabel('Edit Nomination');
      await waitFor('!!document.querySelector("#wizard-next-btn")');
      assert.equal(await evaluate(positionValue), 'Revised Officer', 'prefilled server draft resumes');
    }
    await click('#wizard-next-btn');
    await click('#wizard-next-btn');
    await waitFor('document.querySelector("#nomination-wizard-container").textContent.includes("Existing attachment")');
    await evaluate(`(() => {
      const input = document.querySelector('#nomination-wizard-container input[type=file]');
      const data = new DataTransfer(); data.items.add(new File(['fixture'], 'revised.png', { type: 'image/png' }));
      input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor('document.querySelector("#nomination-wizard-container").textContent.includes("Replacement staged")');
    await click('#wizard-next-btn');
    await waitFor('!!document.querySelector("#wizard-submit-btn")');
    assert.match(await evaluate('document.querySelector("#wizard-submit-btn").textContent'), /Submit Revised Nomination/);
    await click('#wizard-submit-btn');
    assert.match(await evaluate('document.querySelector("#nomination-wizard-container").textContent'), /Draw your signature/);
    await evaluate('document.querySelector("canvas").scrollIntoView({block:"center"})');
    const rect = await evaluate('(() => { const r = document.querySelector("canvas").getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width }; })()');
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x + 12, y: rect.y + 15, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + rect.width * 0.5, y: rect.y + 38, button: 'left', buttons: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x + rect.width * 0.5, y: rect.y + 38, button: 'left', clickCount: 1 });
    await click('#nomination-wizard-container input[type="checkbox"]');
    const submissions = await evaluate('window.viewerTest.revisionState.submissions');
    writeFileSync(join(temporary, `revision-filer-${width}.png`), Buffer.from((await command('Page.captureScreenshot')).data, 'base64'));
    await click('#wizard-submit-btn');
    await waitFor('!!document.querySelector("#nomination-success-card")');
    assert.match(await evaluate('document.querySelector("#nomination-success-card").textContent'), /PRAISE-VIEWER/);
    assert.equal(await evaluate('window.viewerTest.revisionState.submissions'), submissions + 1);
  }
  await evaluate("window.viewerTest.state.signatureFail=false; window.viewerTest.render('ADMINISTRATOR')");
  await open();
  await evaluate('Array.from(document.querySelectorAll("summary")).find(item => item.textContent.includes("Nomination revision and version history")).click()');
  await set('[role=dialog] select', '1');
  await waitFor('document.querySelector("[role=dialog]").textContent.includes("Original Nominee Record")');
  assert.match(await evaluate('document.querySelector("[role=dialog]").textContent'), /Compare with latest finalized version/);
  await close();
  console.log('PASS: administrator authorization controls, original filer ownership, staged draft restoration, scope restrictions, new signatures and historical version selection on desktop and mobile.');
  console.log('PASS: shared viewer across roles at 320/390/768/1100px; tabs, focus, workflows, previews, signatures, legacy/error handling; full PDF downloads with fresh retrieval, embedded attachments, loading state, evaluator privacy and signature failure.');
  console.log(`Review artifacts: ${temporary}`);
} finally {
  socket?.close(); browser.kill(); await new Promise(ok => server.close(ok));
  // Keep review artifacts; remove only Chromium's disposable profile.
  await delay(300);
  const profile = resolve(temporary, 'profile');
  if (profile !== join(resolve(temporary), 'profile')) throw Error('Invalid disposable browser profile path.');
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chromium may still be releasing files. */ }
}
