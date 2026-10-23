// play-test.mjs — 크롬으로 게임을 처음부터 끝까지 해 보는 시험
//   node tools/cdp.mjs tools/play-test.mjs        (이 PC는 SOFTGL=1 을 앞에 붙인다)
// 화면은 OUT 폴더(없으면 저장소 맨 위)에 찍는다.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || ROOT;
const PORT = 8700 + Math.floor(Math.random() * 200);
export const options = { width: 1280, height: 860 };

export default async function (t) {
  const srv = spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs'), ROOT, String(PORT)], { stdio: 'ignore' });
  const fails = [];
  const ok = (cond, what) => { console.log((cond ? '  ✔ ' : '  ✘ ') + what); if (!cond) fails.push(what); };
  const type = (w) => t.eval(`(() => { document.querySelector('#guess').value = ${JSON.stringify(w)}; document.querySelector('#guessForm').requestSubmit(); return document.querySelector('#msg').textContent; })()`);
  const ready = () => t.waitFor('window.__kk && __kk.scores && __kk.game');
  try {
    await t.sleep(400);
    const base = `http://127.0.0.1:${PORT}/`;
    await t.goto(base);
    await ready();
    await t.eval('localStorage.clear(), location.reload()');
    await t.sleep(300);
    await ready();

    ok(await t.eval(`!document.querySelector('#modal').hidden`), '처음 오면 하는 방법이 뜬다');
    await t.eval(`document.querySelector('[data-go=close]').click()`);
    ok(await t.eval(`document.querySelector('#modal').hidden`), '시작하기를 누르면 닫힌다');

    ok((await type('뚱딴지같은말')).includes('모르는 낱말'), '목록에 없는 낱말은 모른다고 한다');
    const m = await type('섹스');
    ok(m.includes('모르는 낱말') && !m.includes('섹스'), '금지 낱말은 받지 않고 되풀이해 보여 주지도 않는다');
    await type('학교에서');
    ok(await t.eval(`__kk.game.guesses.some(x => x.w === '학교')`), '「학교에서」를 「학교」로 알아듣는다');
    await type('학교');
    ok((await t.eval(`document.querySelector('#msg').textContent`)).includes('벌써'), '같은 낱말은 벌써 썼다고 한다');
    await type('바다'); await type('가을');
    ok(await t.eval(`document.querySelectorAll('#list tbody tr').length === 3`), '쓴 낱말이 목록에 쌓인다');
    ok(await t.eval(`(() => { const s = [...document.querySelectorAll('#list td.s')].map(e => +e.textContent); return s.every((v, i) => !i || s[i - 1] >= v); })()`), '목록은 점수 높은 순이다');

    await t.eval(`document.querySelector('#btnHint').click()`);
    await t.eval(`document.querySelector('#btnHint').click()`);
    const hints = await t.eval(`__kk.game.guesses.filter(x => x.hint).map(x => ({ w: x.w, r: __kk.rankOf[x.i], shown: !!((__kk.show[x.i >> 3] >> (x.i & 7)) & 1) }))`);
    ok(hints.length === 2 && hints[0].r >= 100 && hints[1].r >= 10 && hints[1].r < 100, `힌트 두 번: ${hints.map((h) => h.w + ' ' + h.r + '위').join(', ')}`);
    ok(hints.every((h) => h.shown), '힌트 낱말은 보여 줘도 되는 낱말이다');
    ok(await t.eval(`document.querySelector('#btnHint').hidden`), '힌트를 다 쓰면 힌트 단추가 사라진다');

    await t.shot(join(OUT, 'kk-1-play.png'));

    const answer = await t.eval(`__kk.words.find(w => (() => { let h = 0x811c9dc5; const s = __kk.puzzle.code + w; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); })() === __kk.h)`);
    ok(!!answer, '정답 확인 해시가 낱말 하나와 맞는다');
    await type(answer + '를');
    await t.sleep(700);
    ok(await t.eval(`__kk.game.done && !__kk.game.gaveUp`), '정답(조사를 붙여도)을 쓰면 맞힌다');
    ok(await t.eval(`document.querySelector('.answer').textContent === ${JSON.stringify(answer)}`), '맞힌 창에 정답이 보인다');
    ok(await t.eval(`document.querySelectorAll('.near li').length === 10`), '가까운 낱말 10개가 보인다');
    await t.shot(join(OUT, 'kk-2-win.png'));

    await t.eval('location.reload()');
    await t.sleep(300);
    await ready();
    await t.sleep(400);
    ok(await t.eval(`__kk.game.done && !document.querySelector('#modal').hidden`), '다시 열어도 맞힌 채로 남는다');
    await t.eval(`document.querySelector('#btnStats').click()`);
    ok(await t.eval(`document.querySelector('.stats b').textContent === '1'`), '내 기록에 맞힌 문제 1개');
    await t.eval(`document.querySelector('#btnPast').click()`);
    ok(await t.eval(`document.querySelectorAll('.past li').length >= 1 && document.querySelector('.past .st.win') !== null`), '지난 문제 목록에 오늘이 맞힘으로 나온다');

    const other = await t.eval(`fetch('data/schedule.json').then(r => r.json()).then(s => s.days[5])`);
    await t.goto(base + '?p=' + other);
    await ready();
    ok(await t.eval(`__kk.puzzle.label === '선생님이 고른 문제' && !__kk.game.done`), '선생님 링크(?p=)는 다른 문제를 연다');

    await t.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await t.eval(`document.querySelector('#mClose').click()`);
    await type('사과'); await type('친구');
    await t.sleep(900);
    ok(await t.eval(`document.documentElement.scrollWidth <= 375`), '폰 너비에서 옆으로 넘치지 않는다');
    await t.shot(join(OUT, 'kk-3-phone.png'));
  } finally {
    srv.kill();
  }
  console.log(fails.length ? `실패 ${fails.length}건` : '모두 통과');
  if (fails.length) process.exitCode = 1;
}
