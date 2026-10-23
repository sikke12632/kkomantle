// cdp.mjs — 크롬을 띄워 게임을 시험하고 화면을 찍는 작은 도구 (Node 22 이상, 외부 패키지 없음). 조선의 왕 도구를 본떴다.
//   node tools/cdp.mjs <시나리오.mjs>
// 시나리오는 export default async function (t) { ... } 이고 t 에 아래 도우미가 들어 있다.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ headless = true, width = 1366, height = 768 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kk-chrome-'));
  const args = [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${width},${height}`,
    '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  ];
  // SOFTGL=1: 그래픽 칩 대신 소프트웨어(SwiftShader)로 그린다. 컴퓨터가 잠겨 그래픽 칩이 멈춘 때 논리 시험용(fps는 믿지 말 것)
  if (headless) args.push('--headless=new', ...(process.env.SOFTGL ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-unsafe-swiftshader=false']));
  // UNCAP=1: 60fps 제한을 풀어 그래픽 칩의 실제 여유를 본다
  if (process.env.UNCAP) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  else args.push('--window-position=40,40');
  args.push('about:blank');
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  let ver;
  for (let i = 0; i < 60; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(250); }
  }
  if (!ver) throw new Error('크롬 연결 실패');
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method) listeners.forEach((f) => f(m));
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Page.enable');
  await s('Runtime.enable');
  await s('Network.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const logs = [];
  const net = new Map();
  listeners.push((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Page.javascriptDialogOpening') { logs.push('[dialog] ' + m.params.message); send('Page.handleJavaScriptDialog', { accept: true }, sessionId); }
    if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Network.responseReceived') net.set(m.params.requestId, { url: m.params.response.url, status: m.params.response.status });
    if (m.method === 'Network.loadingFinished' && net.has(m.params.requestId)) net.get(m.params.requestId).bytes = m.params.encodedDataLength;
  });
  const t = {
    send: s, logs, net, sleep, listeners,
    async goto(url) { await s('Page.navigate', { url }); await sleep(500); },
    async eval(expr) {
      const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, ms = 20000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await t.eval(expr)) return true; } catch {} await sleep(200); }
      throw new Error('기다림 초과: ' + expr);
    },
    async shot(file) {
      const r = await s('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    async cpu(rate) { await s('Emulation.setCPUThrottlingRate', { rate }); },
    // n초 동안 프레임을 재서 평균·하위 fps를 돌려준다
    async fps(sec = 5) {
      return t.eval(`new Promise(r => { const a = []; let last = performance.now(); const t0 = last;
        function f(now) { a.push(now - last); last = now; if (now - t0 < ${sec * 1000}) requestAnimationFrame(f); else {
          a.shift(); a.sort((x, y) => x - y); const avg = a.reduce((s, x) => s + x, 0) / a.length;
          const p95 = a[Math.floor(a.length * 0.95)];
          r({ frames: a.length, avgFps: 1000 / avg, p95ms: p95, low1Fps: 1000 / p95 }); } }
        requestAnimationFrame(f); })`);
    },
    // 끝나면 임시 프로필 폴더도 지운다(크롬이 파일을 놓을 때까지 잠깐 기다렸다가)
    async close() {
      try { await send('Browser.close'); } catch {}
      proc.kill();
      for (let i = 0; i < 10; i++) { try { rmSync(dir, { recursive: true, force: true }); break; } catch { await sleep(300); } }
    },
  };
  return t;
}

if (process.argv[2]) {
  const mod = await import(pathToFileURL(resolve(process.argv[2])).href);
  const t = await launch(mod.options || {});
  try { await mod.default(t); } catch (e) { console.error('실패:', e.message); }
  finally { if (t.logs.length) console.log('콘솔:\n' + t.logs.join('\n')); await t.close(); }
}
