// clock-test.mjs — 선생님 화면 없이 아이 기기만으로 판이 도는지(판의 시계) 가짜 서버로 시험
//   node tools/cdp.mjs tools/clock-test.mjs        (이 PC는 SOFTGL=1 을 앞에 붙인다)
// 아이 탭 둘: 첫 판 열기 → 공개 → 맞힘 → N분 뒤 새 낱말 판. 여러 기기가 겹쳐도 한 번만 되는지도 본다.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8700 + Math.floor(Math.random() * 200);
const ROOM = 'clock-' + Date.now().toString(36);
export const options = { width: 1000, height: 800 };

const FIND_ANSWER = `__kk.W.words.find(w => { let h = 0x811c9dc5; const s = __kk.P.code + w;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0') === __kk.P.h; })`;

export default async function (kidA) {
  const srv = spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
  const fails = [];
  const ok = (cond, what) => { console.log((cond ? '  ✔ ' : '  ✘ ') + what); if (!cond) fails.push(what); };
  const url = `http://127.0.0.1:${PORT}/?mock&autostart&room=${ROOM}`;
  const room = (t) => t.eval(`JSON.parse(localStorage.getItem('kkmock:rooms/${ROOM}'))`);
  const edit = (t, js) => t.eval(`(() => { const k = 'kkmock:rooms/${ROOM}'; const r = JSON.parse(localStorage.getItem(k)); ${js}; localStorage.setItem(k, JSON.stringify(r)); window.dispatchEvent(new StorageEvent('storage', { key: k })); })()`);
  const front = (t) => t.send('Page.bringToFront');
  const type = (t, w) => t.eval(`(() => { document.querySelector('#guess').value = ${JSON.stringify(w)}; document.querySelector('#guessForm').requestSubmit(); })()`);
  try {
    await kidA.sleep(400);
    const kidB = await kidA.newPage();
    for (const [kid, num] of [[kidA, 3], [kidB, 55]]) {
      await kid.goto(url);
      await kid.waitFor(`window.__kk && __kk.W && __kk.sched && __kk.uid`, 60000);
      await kid.eval(`document.querySelector('[data-go=close]')?.click(); document.querySelector('[data-n="${num}"]').click()`);
    }
    // 1) 아무도 판을 안 열었어도 아이 기기가 첫 판을 연다(시험용 판이라 시간 제한 없음)
    await front(kidA);
    await kidA.waitFor(`!document.querySelector('#guessForm').hidden`, 60000).catch(async (e) => {
      console.log('  진단:', JSON.stringify(await kidA.eval(`({ state: __kk.room && __kk.room.state, num: __kk.num, P: __kk.P && __kk.P.code, round: __kk.round, title: document.querySelector('#heroTitle').textContent, sub: document.querySelector('#heroSub').textContent, numForm: !document.querySelector('#numForm').hidden, modal: __kk.modal })`)));
      throw e;
    });
    await front(kidB);
    await kidB.waitFor(`!document.querySelector('#guessForm').hidden`, 60000);
    const r1 = await room(kidA);
    ok(r1 && r1.state === 'open' && r1.used.length === 1, `선생님 없이 아이 기기가 첫 판을 열었다 (${r1 && r1.code})`);

    // 2) 낱말을 쓰면 이번 판 표시(round)와 함께 올라간다
    for (const w of ['학교', '가을', '바다']) await type(kidA, w);
    for (const w of ['나무', '친구']) await type(kidB, w);
    await kidA.sleep(2500);
    const players = await kidA.eval(`Object.keys(localStorage).filter(k => k.startsWith('kkmock:players/${ROOM}/')).map(k => JSON.parse(localStorage.getItem(k)))`);
    ok(players.length === 2 && players.every((p) => p.round === r1.openedAt), '아이들 낱말에 이번 판 표시가 붙는다');

    // 3) 공개할 때가 되면 아이 기기가 공개한다(한 번만)
    await edit(kidA, `r.topAt = Date.now() - r.revealEvery * 1000 - 1000`);
    await front(kidA);
    await kidA.waitFor(`(JSON.parse(localStorage.getItem('kkmock:rooms/${ROOM}')).top || []).length > 0`, 60000);
    const r2 = await room(kidA);
    ok(r2.top.length >= 1 && r2.top.length <= 3, `선생님 화면 없이 반이 찾은 낱말이 공개됐다: ${r2.top.map((x) => x.w).join(', ')}`);
    await kidA.sleep(14000);
    ok((await room(kidA)).topAt === r2.topAt, '공개는 한 번만 했다(다음 공개 때까지 다시 안 함)');

    // 4) 55번이 맞히고, N분이 지나면 아이 기기가 새 낱말로 새 판을 연다(한 번만)
    const ans = await kidB.eval(FIND_ANSWER);
    await type(kidB, ans);
    await front(kidB);
    await kidB.waitFor(`__kk.modal === 'write'`, 15000);
    await edit(kidA, `r.solvedAt = Date.now() - r.autoNext * 60e3 - 1000`);
    await front(kidA);
    await kidA.waitFor(`JSON.parse(localStorage.getItem('kkmock:rooms/${ROOM}')).state === 'open'`, 60000);
    const r3 = await room(kidA);
    ok(r3.code !== r1.code && r3.used.length === 2, `맞히고 시간이 지나자 새 낱말로 새 판이 열렸다 (${r1.code} → ${r3.code})`);
    await front(kidA);
    await kidA.waitFor(`__kk.P && __kk.P.code === ${JSON.stringify(r3.code)} && !document.querySelector('#guessForm').hidden`, 15000);
    await front(kidB);
    await kidB.waitFor(`__kk.P && __kk.P.code === ${JSON.stringify(r3.code)} && !document.querySelector('#guessForm').hidden`, 15000);
    ok(true, '두 아이 화면 모두 새 판으로 바뀌었다');
    await kidA.sleep(14000);
    ok((await room(kidA)).used.length === 2, '새 판은 한 번만 열렸다(두 기기가 겹쳐 두 번 열지 않음)');

    // 5) 선생님이 닫은 판은 아이 기기가 다시 열지 않는다
    await edit(kidA, `r.state = 'closed'`);
    await kidA.sleep(14000);
    ok((await room(kidA)).state === 'closed', '선생님이 닫은 판은 아이 기기가 다시 열지 않는다');
  } finally {
    srv.kill();
  }
  console.log(fails.length ? `실패 ${fails.length}건` : '모두 통과');
  if (fails.length) process.exitCode = 1;
}
