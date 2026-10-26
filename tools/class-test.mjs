// class-test.mjs — 가짜 서버(?mock)로 반 판 전체를 크롬 탭 여러 개로 해 보는 시험
//   node tools/cdp.mjs tools/class-test.mjs        (이 PC는 SOFTGL=1 을 앞에 붙인다)
// 선생님 탭 하나 + 아이 탭 둘. 화면은 OUT 폴더(없으면 저장소 맨 위)에 찍는다.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || ROOT;
const PORT = 8700 + Math.floor(Math.random() * 200);
const ROOM = 'test-' + Date.now().toString(36);
export const options = { width: 1100, height: 860 };

const FIND_ANSWER = `__kk.W.words.find(w => { let h = 0x811c9dc5; const s = __kk.P.code + w;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0') === __kk.P.h; })`;

export default async function (teacher) {
  const srv = spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
  const fails = [];
  const ok = (cond, what) => { console.log((cond ? '  ✔ ' : '  ✘ ') + what); if (!cond) fails.push(what); };
  const base = `http://127.0.0.1:${PORT}/`;
  const q = `?mock&room=${ROOM}`;
  // 시험하는 탭을 앞으로 가져온다(뒤에 있는 탭은 타이머가 느리게 돈다)
  const front = (t) => t.send('Page.bringToFront');
  const click = (t, sel) => t.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const type = (t, w) => t.eval(`(() => { document.querySelector('#guess').value = ${JSON.stringify(w)}; document.querySelector('#guessForm').requestSubmit(); return document.querySelector('#msg').textContent; })()`);
  const visible = (t, sel) => t.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && !e.hidden && !e.closest('[hidden]'); })()`);
    try {
    await teacher.sleep(400);
    // ---- 선생님 ----
    await teacher.goto(base + 'teacher.html' + q);
    await teacher.waitFor(`window.__kt && __kt.W && __kt.P`, 60000);
    ok(await visible(teacher, '#login'), '선생님 화면은 처음에 구글 로그인을 묻는다');
    await click(teacher, '#btnLogin');
    await teacher.waitFor(`!document.querySelector('#desk').hidden`);
    ok(true, '로그인하면 선생님 책상이 보인다');
    ok(await teacher.eval(`document.querySelector('#answerWord').textContent.startsWith('●')`), '비밀 낱말은 처음에 가려져 있다');
    await click(teacher, '#btnPeek');
    const answer = await teacher.eval(`document.querySelector('#answerWord').textContent`);
    ok(answer && !answer.includes('●'), `「보기」를 누르면 비밀 낱말이 보인다 (${answer})`);
    await click(teacher, '#btnPeek');

    // ---- 아이 둘 (판이 열리기 전) ----
    const kidA = await teacher.newPage();
    const kidB = await teacher.newPage();
    for (const [kid, num] of [[kidA, 7], [kidB, 52]]) {
      await kid.goto(base + q);
      await kid.waitFor(`window.__kk && __kk.W && __kk.uid`, 60000);
      await kid.sleep(300);
      ok(await visible(kid, '#modal'), `${num}번: 처음 오면 하는 방법이 뜬다`);
      await click(kid, '[data-go=close]');
      ok(await visible(kid, '#numForm'), `${num}번: 출석 번호를 먼저 묻는다`);
      await click(kid, `[data-n="${num}"]`);
      await kid.waitFor(`document.querySelector('#heroTitle').textContent.includes('선생님이 판을 열면')`);
      ok(!(await visible(kid, '#guessForm')), `${num}번: 판이 열리기 전에는 낱말을 쓸 수 없다`);
    }
    await kidA.shot(join(OUT, 'kc-1-wait.png'));

    ok(await kidA.eval(`(() => { const n = [...document.querySelectorAll('[data-n]')].map(b => +b.dataset.n); return n.length === 34 && n[0] === 1 && n[17] === 18 && n[18] === 51 && n[33] === 66; })()`), '출석 번호는 1~18번, 51~66번');
    // ---- 판 열기 ----
    await front(teacher);
    await teacher.eval(`document.querySelector('#revealEvery').value = '60'`);
    await click(teacher, '#btnOpen');
    await kidA.waitFor(`!document.querySelector('#guessForm').hidden`);
    await kidB.waitFor(`!document.querySelector('#guessForm').hidden`);
    ok(true, '선생님이 판을 열면 두 아이 화면이 저절로 열린다');
    ok(await kidA.eval(`__kk.P.code`) === await teacher.eval(`__kt.P.code`), '아이와 선생님이 같은 문제를 푼다');

    for (const w of ['학교', '바다에서', '가을', '친구']) await type(kidA, w);
    ok(await kidA.eval(`__kk.game.guesses.length === 4`), '7번이 낱말 4개를 썼다');
    const m = await type(kidB, '섹스');
    ok(m.includes('모르는 낱말') && !m.includes('섹스'), '금지 낱말은 받지 않고 되풀이해 보여 주지도 않는다');
    for (const w of ['나무', '사과']) await type(kidB, w);
    await kidB.sleep(1500);
    await front(teacher);
    await teacher.waitFor(`__kt.players.length === 2 && __kt.players.every(p => p.best.length)`, 20000);
    ok(true, '선생님 화면에 두 아이와 가장 가까운 낱말이 보인다');
    ok(await teacher.eval(`document.querySelectorAll('#kids tr').length === 2`), '아이들 표에 두 줄');

    // ---- 반이 찾은 낱말 공개: 시간이 되면 저절로 ----
    await teacher.eval(`(() => { const k = 'kkmock:rooms/${ROOM}'; const r = JSON.parse(localStorage.getItem(k)); r.topAt = Date.now() - 61000; localStorage.setItem(k, JSON.stringify(r)); window.dispatchEvent(new StorageEvent('storage', { key: k })); })()`);
    await kidA.waitFor(`document.querySelectorAll('#ctWords .ct-chip').length > 0`, 8000);
    const top = await kidA.eval(`[...document.querySelectorAll('#ctWords .ct-chip b')].map(b => b.textContent)`);
    ok(top.length >= 1 && top.length <= 3, `정해진 시간이 지나면 반이 찾은 낱말이 공개된다: ${top.join(', ')}`);
    ok(await kidA.eval(`${JSON.stringify(top)}.every(w => { const i = __kk.W.index.get(w); return (__kk.W.show[i >> 3] >> (i & 7)) & 1; })`), '공개된 낱말은 보여 줘도 되는 낱말이다');
    await kidA.shot(join(OUT, 'kc-2-play.png'));

    // ---- 가짜 '맞힘'은 선생님 화면이 되돌린다 ----
    await kidA.eval(`(() => { const k = 'kkmock:rooms/${ROOM}'; const r = JSON.parse(localStorage.getItem(k)); Object.assign(r, { state: 'solved', answer: '가짜정답', solvedNum: 7, solvedUid: 'x' }); localStorage.setItem(k, JSON.stringify(r)); })()`);
    await front(teacher);
    ok(await teacher.waitFor(`JSON.parse(localStorage.getItem('kkmock:rooms/${ROOM}')).state === 'open'`, 10000).catch(() => false), '가짜 정답으로 맞혔다고 올리면 선생님 화면이 판을 다시 연다');

    // ---- 52번이 맞힌다 ----
    await front(kidB);
    const ans = await kidB.eval(FIND_ANSWER);
    await type(kidB, ans + '를');
    await kidB.waitFor(`__kk.modal === 'write'`, 8000);
    ok(true, '맞힌 아이에게 축하와 한마디 쓰기 창이 뜬다');
    await kidA.waitFor(`__kk.modal === 'reveal'`, 8000);
    ok(await kidA.eval(`document.querySelector('#mBody .answer').textContent`) === ans, '다른 아이 화면에도 정답이 열린다');
    ok(await kidA.eval(`document.querySelector('#mBody h2').textContent.includes('52번')`), '누가 찾았는지(번호) 보인다');
    ok(await kidA.eval(`document.querySelector('#guessForm').hidden`), '맞히면 다른 아이도 더 쓸 수 없다');
    await kidB.shot(join(OUT, 'kc-3-note.png'));

    // ---- 한마디: 금지어는 막고, 보내면 선생님 검토 없이 바로 모두에게 ----
    await kidB.eval(`document.querySelector('#noteText').value = '씨 1발 다들 화이팅'; document.querySelector('#noteSend').click()`);
    await kidB.sleep(500);
    const warn = await kidB.eval(`document.querySelector('#noteLen').textContent`);
    ok(warn.includes('쓸 수 없는 말') && !warn.includes('발'), '띄어 쓰거나 숫자를 끼워도 금지어는 막고, 그 말을 되풀이하지 않는다');
    ok(!(await teacher.eval(`!!(__kt.room && __kt.room.message)`)), '막힌 한마디는 아무 화면에도 가지 않는다');
    await kidB.eval(`document.querySelector('#noteText').value = '다시 발견한 우정! 한 개 같이 나눠 먹자'; document.querySelector('#noteSend').click()`);
    await kidA.waitFor(`!document.querySelector('#shout').hidden`, 8000);
    ok(true, '낱말 사이에 우연히 생긴 글자(다시 발견, 한 개 같이)는 막지 않는다');
    await kidA.eval(`document.querySelector('#shoutClose').click()`);
    await click(teacher, '[data-act=remove]');
    await kidA.sleep(300);
    // 「새 낱말로 한 판 더!」: 오늘 안 쓴 새 낱말로 바로 새 판이 열린다
    await front(teacher);
    const oldCode = await teacher.eval(`__kt.room.code`);
    await click(teacher, '[data-act=newRound]');
    await kidB.waitFor(`__kk.P && __kk.P.code !== ${JSON.stringify(oldCode)} && !document.querySelector('#guessForm').hidden`, 10000);
    await kidA.waitFor(`__kk.P && __kk.P.code !== ${JSON.stringify(oldCode)} && !document.querySelector('#guessForm').hidden`, 10000);
    ok(await teacher.eval(`__kt.room.used.length === 2 && __kt.room.used.includes(${JSON.stringify(oldCode)})`), '「새 낱말로 한 판 더!」를 누르면 새 낱말로 바로 새 판이 열리고, 두 아이 화면도 새 판으로 바뀐다');
    await front(kidB);
    const ans2 = await kidB.eval(FIND_ANSWER);
    ok(ans2 && ans2 !== ans, `새 판은 다른 낱말이다 (${ans} → ${ans2})`);
    await type(kidB, ans2);
    await kidB.waitFor(`__kk.modal === 'write'`, 8000);
    await kidA.waitFor(`__kk.modal === 'reveal'`, 8000);
    await kidB.eval(`document.querySelector('#noteText').value = '우리 반 모두 오늘 하루도 즐겁게 보내자! 너희가 있어서 행복해.'; document.querySelector('#noteSend').click()`);
    await kidA.waitFor(`!document.querySelector('#shout').hidden`, 8000);
    ok((await kidA.eval(`document.querySelector('#shoutText').textContent`)).includes('행복'), '맞힌 아이가 보내면 선생님 검토 없이 바로 모든 아이 화면에 크게 뜬다');
    await teacher.waitFor(`document.querySelector('.note-big') && document.querySelector('.note-big').textContent.includes('행복')`, 8000);
    ok(true, '선생님 화면에도 떴다고 보인다');
    await teacher.shot(join(OUT, 'kc-4-teacher.png'));
    await kidA.sleep(2200);
    await kidA.shot(join(OUT, 'kc-5-shout.png'));
    await click(teacher, '[data-act=remove]');
    await kidA.waitFor(`document.querySelector('#shout').hidden`, 8000);
    ok(true, '선생님이 「화면에서 지우기」를 누르면 아이 화면에서 한마디가 사라진다');

    // ---- 다시 열어도 그대로 ----
    await kidA.eval('location.reload()');
    await kidA.waitFor(`window.__kk && __kk.P && __kk.modal === 'reveal'`, 30000).catch(async (e) => {
      console.log('  진단:', JSON.stringify(await kidA.eval(`({ modal: __kk.modal, state: __kk.room && __kk.room.state, code: __kk.room && __kk.room.code, P: __kk.P && __kk.P.code, title: document.querySelector('#heroTitle').textContent })`)));
      throw e;
    });
    ok(await kidA.eval(`document.querySelector('#shout').hidden`), '새로 고침 해도 이미 본(또는 지운) 한마디는 다시 뜨지 않는다');

    // ---- 판 닫기 ----
    await click(teacher, '[data-act=closeRoom]');
    await kidA.waitFor(`document.querySelector('#heroTitle').textContent.includes('끝났어요')`, 8000);
    ok(true, '선생님이 판을 닫으면 아이 화면에 「오늘 판은 끝났어요」');

    // ---- 폰 너비 ----
    await kidB.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await click(teacher, '#btnOpen');
    await kidB.waitFor(`!document.querySelector('#guessForm').hidden`, 8000);
    ok(await teacher.eval(`__kt.room.used.length === 3 && new Set(__kt.room.used).size === 3`), '닫았다가 다시 열어도 오늘 쓴 낱말은 다시 나오지 않는다');
    await type(kidB, '운동장'); await type(kidB, '하늘');
    await kidB.sleep(800);
    ok(await kidB.eval(`document.documentElement.scrollWidth <= 375`), '폰 너비에서 옆으로 넘치지 않는다');
    await kidB.shot(join(OUT, 'kc-6-phone.png'));
  } finally {
    srv.kill();
  }
  console.log(fails.length ? `실패 ${fails.length}건` : '모두 통과');
  if (fails.length) process.exitCode = 1;
}
