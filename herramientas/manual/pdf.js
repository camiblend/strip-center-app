const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const [, , entrada, salida, consulta] = process.argv;
const perfil = fs.mkdtempSync('/private/tmp/claude-501/chrome-');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9334', '--user-data-dir=' + perfil, 'about:blank'], { stdio: 'ignore' });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let ws; for (let i = 0; i < 50 && !ws; i++) { try { ws = (await (await fetch('http://127.0.0.1:9334/json')).json()).find((x) => x.type === 'page').webSocketDebuggerUrl; } catch (e) {} await espera(200); }
  const s = new WebSocket(ws); let id = 0; const pend = {};
  await new Promise((r) => s.addEventListener('open', r));
  s.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } });
  const cmd = (method, params) => new Promise((r) => { const i = ++id; pend[i] = r; s.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await cmd('Page.enable');
  await cmd('Page.navigate', { url: 'file://' + path.resolve(entrada) + (consulta ? '?' + consulta : '') });
  await espera(2500);
  const r = await cmd('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="font-size:8pt;color:#777;width:100%;text-align:center;font-family:Helvetica">Manual de uso · App Strip Center · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>' });
  fs.writeFileSync(salida, Buffer.from(r.result.data, 'base64'));
  console.log('ok', salida); s.close(); chrome.kill(); process.exit(0);
})();
