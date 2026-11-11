// Saca las capturas con Chrome sin ventana (protocolo DevTools). Uso: node capturar.js tomas.js carpeta_salida [solo]
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const [, , archivoTomas, salida, solo] = process.argv;
const TOMAS = require(path.resolve(archivoTomas));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const perfil = fs.mkdtempSync('/private/tmp/claude-501/chrome-');
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', '--user-data-dir=' + perfil, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let ws;
  for (let i = 0; i < 50; i++) {
    try { const l = await (await fetch('http://127.0.0.1:9333/json')).json(); const p = l.find((x) => x.type === 'page'); if (p) { ws = p.webSocketDebuggerUrl; break; } } catch (e) {}
    await espera(200);
  }
  const s = new WebSocket(ws); let id = 0; const pend = {};
  await new Promise((r) => s.addEventListener('open', r));
  s.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } });
  const cmd = (method, params) => new Promise((r) => { const i = ++id; pend[i] = r; s.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const js = async (expr) => { const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) console.log('  JS error:', JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result && r.result.result && r.result.result.value; };
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  fs.mkdirSync(salida, { recursive: true });
  for (const t of TOMAS) {
    if (solo && !solo.split(',').includes(t.nombre)) continue;
    const ancho = t.ancho || 390;
    await cmd('Emulation.setDeviceMetricsOverride', { width: ancho, height: t.alto || 844, deviceScaleFactor: 2, mobile: ancho < 700 });
    await cmd('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?' + t.url });
    await espera(900);
    for (const paso of t.pasos || []) { await js(paso); await espera(450); }
    await js('window.scrollTo(0,0)'); await espera(150);
    let clip;
    if (t.recorte) {
      clip = await js(`(function(){var els=${JSON.stringify(t.recorte)}.map(function(s){return document.querySelector(s)}).filter(Boolean);
        if(!els.length) return null; var r=els.map(function(e){return e.getBoundingClientRect()});
        var x0=Math.min.apply(null,r.map(function(a){return a.left})),y0=Math.min.apply(null,r.map(function(a){return a.top})),
        x1=Math.max.apply(null,r.map(function(a){return a.right})),y1=Math.max.apply(null,r.map(function(a){return a.bottom}));
        var m=8; return {x:Math.max(0,x0-m),y:Math.max(0,y0-m+window.scrollY),width:Math.min(innerWidth,x1+m)-Math.max(0,x0-m),height:y1-y0+2*m,scale:1};})()`);
      if (!clip) { console.log('  recorte no encontrado:', t.nombre); continue; }
    } else {
      const h = t.altoFijo || await js('document.documentElement.scrollHeight');
      clip = { x: 0, y: 0, width: ancho, height: Math.min(h, t.maxAlto || 1500), scale: 1 };
    }
    const r = await cmd('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
    fs.writeFileSync(path.join(salida, t.nombre + '.png'), Buffer.from(r.result.data, 'base64'));
    console.log('ok', t.nombre, Math.round(clip.width) + 'x' + Math.round(clip.height));
  }
  s.close(); chrome.kill();
  process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(1); });
