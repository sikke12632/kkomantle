// 우리반 꼬맨틀 — 서버 없이 미리 계산한 점수 파일로 돈다.
// data/words.json   칠 수 있는 낱말 + 게임이 먼저 보여 줘도 되는 낱말 표시
// data/schedule.json 날짜 → 문제 코드 (한국 시간 자정에 바뀐다)
// data/p/<코드>.json 문제 하나: 낱말마다 점수, 정답 확인 해시, 뜻풀이
'use strict';

const VER = 1; // index.html 의 ?v= 와 같이 올린다
const HOT_RANK = 1000; // 이 순위 안이면 "가까워요" 표시
const HINT_RANKS = [100, 10];
const KEY = 'kkomantle:v1:';
const $ = (s) => document.querySelector(s);

const S = {
  words: [], index: new Map(), show: null,
  puzzle: null, // { key, code, label, date|null }
  scores: null, order: null, rankOf: null, h: '', gloss: '',
  game: null, // { guesses:[{i,w,n,hint}], hints, done, gaveUp, tries }
};

// ---------- 작은 도우미 ----------
function hash(s) { // make_puzzles.py 의 fnv1a 와 같은 계산
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function b64bytes(b) { const s = atob(b); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
function unhide(b, code) { const a = b64bytes(b); for (let i = 0; i < a.length; i++) a[i] ^= code.charCodeAt(i % code.length); return new TextDecoder().decode(a); }
function load(k, d) { try { const v = localStorage.getItem(KEY + k); return v ? JSON.parse(v) : d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch {} }
// 받침에 따라 조사 고르기: josa('바다', '은', '는') → '는'
function josa(w, a, b) { const c = w.charCodeAt(w.length - 1) - 0xac00; const has = c >= 0 && c < 11172 && c % 28 > 0; return has ? a : b; }
function ro(w) { const c = w.charCodeAt(w.length - 1) - 0xac00; const jong = c >= 0 && c < 11172 ? c % 28 : 0; return jong === 0 || jong === 8 ? '로' : '으로'; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmt(v) { return (v / 100).toFixed(2); }

// 한국 시간 날짜(YYYY-MM-DD)
function kstToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dayDiff(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); }
function korDate(iso) { const [, m, d] = iso.split('-').map(Number); return `${m}월 ${d}일`; }

async function getJSON(url) {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + VER);
  if (!r.ok) throw new Error(url);
  return r.json();
}

// ---------- 문제 고르기 ----------
let SCHED = null;
function codeForDate(iso) {
  const n = dayDiff(SCHED.start, iso);
  if (n < 0) return null;
  return SCHED.days[n % SCHED.days.length];
}
function puzzleNumber(iso) { return dayDiff(SCHED.start, iso) + 1; }

function pickPuzzle() {
  const q = new URLSearchParams(location.search);
  const today = kstToday();
  const p = (q.get('p') || '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(p)) return { key: 'p-' + p, code: p, label: '선생님이 고른 문제', date: null };
  let d = q.get('d');
  if (!d || !/^\d{4}-\d\d-\d\d$/.test(d) || d > today || dayDiff(SCHED.start, d) < 0) d = today;
  return { key: d, code: codeForDate(d), label: (d === today ? '오늘 ' : '') + `${korDate(d)} · ${puzzleNumber(d)}번째 문제`, date: d };
}

async function loadPuzzle(pz) {
  const data = await getJSON(`data/p/${pz.code}.json`);
  S.puzzle = pz;
  S.h = data.h;
  S.gloss = unhide(data.g, pz.code);
  S.scores = new Int16Array(b64bytes(data.s).buffer);
  const n = S.scores.length;
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => S.scores[b] - S.scores[a]);
  const rankOf = new Int32Array(n);
  for (let r = 0; r < n; r++) rankOf[order[r]] = r + 1;
  S.order = order; S.rankOf = rankOf;
  S.game = load('game:' + pz.key, null) || { guesses: [], hints: 0, done: false, gaveUp: false, tries: 0 };
}

// ---------- 낱말 다듬기: 띄어쓰기·조사 ----------
const JOSA = ['에서부터', '으로부터', '로부터', '에게서', '한테서', '이라고', '께서', '에서', '에게', '한테', '으로', '이랑', '처럼', '보다', '까지', '부터', '하고', '이나', '이다', '로', '랑', '나', '와', '과', '을', '를', '이', '가', '은', '는', '에', '의', '도', '만', '야', '아'];
function normalize(raw) {
  const w = raw.normalize('NFC').replace(/[\s.,!?~'"`·]+/g, '');
  if (!w) return { w: '', i: -1 };
  if (S.index.has(w)) return { w, i: S.index.get(w) };
  for (const j of JOSA) {
    if (w.length > j.length && w.endsWith(j)) {
      const base = w.slice(0, -j.length);
      if (S.index.has(base)) return { w: base, i: S.index.get(base) };
    }
  }
  return { w, i: -1 };
}

// ---------- 가까움 ----------
function tier(rank) { return rank <= 10 ? 1 : rank <= 100 ? 2 : rank <= HOT_RANK ? 3 : 4; }
const SAY = { 1: '아주 뜨거워요!', 2: '뜨거워요!', 3: '따뜻해요', 4: '' };
function heatOf(i) { // 0~1, 등불 밝기와 막대 길이
  const r = S.rankOf[i];
  if (r <= HOT_RANK) return 0.5 + 0.5 * (1 - Math.log10(r) / 3);
  const s1000 = S.scores[S.order[HOT_RANK - 1]];
  return Math.max(0.02, Math.min(0.48, 0.48 * S.scores[i] / s1000));
}
function coldSay(i) {
  const h = heatOf(i);
  return h > 0.36 ? '미지근해요' : h > 0.2 ? '조금 차가워요' : '차가워요';
}
function heatCell(i) {
  const r = S.rankOf[i], t = tier(r), h = heatOf(i);
  const tag = t < 4 ? `${r}위` : '1000위 밖';
  return `<div class="heat t${t}"><div class="bar"><i style="width:${(h * 100).toFixed(0)}%"></i></div><span class="tag">${tag}</span></div>`;
}

// ---------- 그리기 ----------
function render(lastI = -1) {
  const g = S.game;
  $('#dayChip').textContent = S.puzzle.label;
  const best = g.guesses.reduce((m, x) => Math.max(m, heatOf(x.i)), 0);
  document.documentElement.style.setProperty('--heat', g.done && !g.gaveUp ? 1 : (best * 0.9).toFixed(3)); // 다 밝아지는 건 맞혔을 때만
  const s = (r) => fmt(S.scores[S.order[r - 1]]);
  $('#scale').innerHTML = `가장 가까운 낱말은 <b>${s(1)}</b>점, 10번째는 <b>${s(10)}</b>점, 1000번째는 <b>${s(1000)}</b>점이에요.`;
  $('#heroTitle').textContent = g.done ? (g.gaveUp ? '정답을 봤어요' : '비밀 낱말을 찾았어요!') : (S.puzzle.date === kstToday() ? '오늘의 비밀 낱말을 찾아라!' : '비밀 낱말을 찾아라!');

  // 방금 쓴 낱말
  const latest = $('#latest');
  const last = lastI >= 0 ? g.guesses.find((x) => x.i === lastI) : null;
  if (last) {
    const t = tier(S.rankOf[last.i]);
    latest.hidden = false;
    latest.style.borderColor = t === 1 ? '#e4572e' : t === 2 ? '#f08a3b' : t === 3 ? '#f0c25b' : 'transparent';
    latest.innerHTML = `<div class="lt-main"><div class="lt-word">${esc(last.w)}</div>
      <div class="lt-score">점수 <b>${fmt(S.scores[last.i])}</b> · <span class="lt-say">${SAY[t] || coldSay(last.i)}</span></div></div>
      <div class="lt-heat">${heatCell(last.i)}</div>`;
    latest.classList.remove('pop'); void latest.offsetWidth; latest.classList.add('pop');
  } else if (!g.guesses.length) latest.hidden = true;

  // 목록: 점수 높은 순
  const rows = [...g.guesses].sort((a, b) => S.scores[b.i] - S.scores[a.i]);
  $('#listCard').hidden = !rows.length;
  $('#count').textContent = `${g.guesses.length}개`;
  $('#list tbody').innerHTML = rows.map((x) =>
    `<tr class="${x.i === lastI ? 'now' : ''}${x.hint ? ' hint' : ''}"><td class="c-n">${x.n}</td><td class="w">${esc(x.w)}</td><td class="s">${fmt(S.scores[x.i])}</td><td>${heatCell(x.i)}</td></tr>`).join('');

  const hintBtn = $('#btnHint');
  hintBtn.hidden = g.done || g.hints >= HINT_RANKS.length;
  if (!hintBtn.hidden) hintBtn.textContent = `힌트: ${HINT_RANKS[g.hints]}번째로 가까운 낱말 보기`;
  $('#btnGiveUp').hidden = g.done;
  $('#guess').disabled = $('#btnGo').disabled = g.done;
  if (g.done) $('#guess').placeholder = '다 했어요! 지난 문제도 해 보세요';
}

function say(text, ok = false) {
  const m = $('#msg');
  m.textContent = text;
  m.className = ok ? 'ok' : '';
}

// ---------- 낱말 넣기 ----------
function submit(raw) {
  const g = S.game;
  if (g.done) return;
  const { w, i } = normalize(raw);
  if (!w) return;
  if (!/^[가-힣]+$/.test(w)) { say('한글 낱말로 써 주세요.'); shake(); return; }
  if (hash(S.puzzle.code + w) === S.h) { win(w, i); return; }
  // 모르는 낱말은 되풀이해 보여 주지 않는다(거친 말이 화면에 뜨지 않게)
  if (i < 0) { say('모르는 낱말이에요. 다른 낱말을 써 보세요.'); shake(); return; }
  const had = g.guesses.find((x) => x.i === i);
  if (had) { say(`「${w}」${josa(w, '은', '는')} 벌써 썼어요.`); render(i); return; }
  g.tries++;
  g.guesses.push({ i, w, n: g.guesses.length + 1 });
  say(w !== raw.trim() ? `「${w}」${ro(w)} 알아들었어요.` : '', true);
  save('game:' + S.puzzle.key, g);
  render(i);
}

function shake() { const f = $('#guessForm'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); }

function useHint() {
  const g = S.game;
  if (g.done || g.hints >= HINT_RANKS.length) return;
  const want = HINT_RANKS[g.hints];
  const used = new Set(g.guesses.map((x) => x.i));
  // 그 순위 근처에서, 게임이 보여 줘도 되는 낱말 가운데 아직 안 쓴 것
  let pick = -1;
  for (let r = want; r < S.order.length && pick < 0; r++) {
    const i = S.order[r - 1];
    if (isShown(i) && !used.has(i)) pick = i;
  }
  if (pick < 0) return;
  g.hints++;
  g.guesses.push({ i: pick, w: S.words[pick], n: g.guesses.length + 1, hint: true });
  save('game:' + S.puzzle.key, g);
  say(`힌트: 「${S.words[pick]}」${josa(S.words[pick], '은', '는')} ${S.rankOf[pick]}번째로 가까운 낱말이에요.`, true);
  render(pick);
}
function isShown(i) { return (S.show[i >> 3] >> (i & 7)) & 1; }

function nearest(k) {
  const out = [];
  for (let r = 0; r < S.order.length && out.length < k; r++) if (isShown(S.order[r])) out.push(S.order[r]);
  return out;
}

// ---------- 맞힘 / 포기 ----------
function win(w, i) {
  const g = S.game;
  g.tries++;
  g.done = true;
  g.answer = w;
  if (i >= 0) g.guesses.push({ i, w, n: g.guesses.length + 1 });
  save('game:' + S.puzzle.key, g);
  record();
  say('');
  render();
  confetti();
  setTimeout(showWin, 450);
}

function giveUp() {
  if (!confirm('정말 그만하고 정답을 볼까요?\n정답을 보면 이 문제는 「못 맞힘」으로 남아요.')) return;
  const g = S.game;
  // 정답은 해시로만 갖고 있으므로 낱말 목록에서 찾는다
  const w = S.words.find((x) => hash(S.puzzle.code + x) === S.h);
  g.done = true; g.gaveUp = true; g.answer = w;
  save('game:' + S.puzzle.key, g);
  record();
  render();
  showWin();
}

function record() {
  const g = S.game, pz = S.puzzle;
  const recs = load('records', {});
  recs[pz.key] = { win: !g.gaveUp, tries: g.tries, hints: g.hints, date: pz.date, at: kstToday() };
  save('records', recs);
}

function showWin() {
  const g = S.game;
  const near = nearest(10);
  const hintNote = g.hints ? ` (힌트 ${g.hints}번)` : '';
  const head = g.gaveUp
    ? `<h2>정답은 이거였어요</h2><p class="sub">다음 문제는 꼭 맞혀 봐요!</p>`
    : `<h2>찾았어요!</h2><p class="sub">${S.puzzle.label}</p><span class="badge">${g.tries}번 만에 맞혔어요${hintNote}</span>`;
  openModal(`${head}
    <div class="answer">${esc(g.answer || '')}</div>
    ${S.gloss ? `<p class="gloss">${esc(S.gloss)}</p>` : ''}
    <h3>비밀 낱말과 가장 가까운 낱말 10개</h3>
    <ol class="near">${near.map((i) => `<li>${esc(S.words[i])}<span>${fmt(S.scores[i])}</span></li>`).join('')}</ol>
    <div class="row-btns"><button class="btn red small" data-go="past">지난 문제 하기</button><button class="btn dark small" data-go="stats">내 기록 보기</button></div>`);
}

// ---------- 기록 ----------
function stats() {
  const recs = load('records', {});
  const daily = Object.entries(recs).filter(([k, r]) => r.date && r.date === k);
  const wins = daily.filter(([, r]) => r.win);
  // 연속 성공: 오늘(아직 안 했으면 어제)부터 거꾸로, 그날 문제를 맞힌 날이 이어진 수
  const won = new Set(wins.map(([k]) => k));
  let d = kstToday();
  if (!won.has(d)) d = addDays(d, -1);
  let streak = 0;
  while (won.has(d)) { streak++; d = addDays(d, -1); }
  const avg = wins.length ? (wins.reduce((s, [, r]) => s + r.tries, 0) / wins.length).toFixed(1) : '-';
  const all = Object.values(recs);
  openModal(`<h2>내 기록</h2><p class="sub">이 기기에만 남아요</p>
    <div class="stats">
      <div><b>${all.filter((r) => r.win).length}</b><span>맞힌 문제</span></div>
      <div><b>${streak}</b><span>연속 맞힌 날</span></div>
      <div><b>${avg}</b><span>평균 몇 번 만에</span></div>
      <div><b>${all.filter((r) => r.hints).length}</b><span>힌트 쓴 문제</span></div>
    </div>
    <p class="sub" style="margin-top:14px">연속 맞힌 날은 그날 문제를 그날 맞혀야 이어져요.</p>`);
}

function past() {
  const today = kstToday();
  const recs = load('records', {});
  const items = [];
  for (let d = today; dayDiff(SCHED.start, d) >= 0 && items.length < 60; d = addDays(d, -1)) {
    const r = recs[d], g = load('game:' + d, null);
    const st = r ? (r.win ? `<span class="st win">${r.tries}번 만에 맞힘</span>` : '<span class="st">정답 봄</span>')
      : g && g.guesses.length ? '<span class="st play">하는 중</span>' : '<span class="st">안 함</span>';
    items.push(`<li><button data-day="${d}"><span>${d === today ? '오늘 · ' : ''}${korDate(d)} · ${puzzleNumber(d)}번째 문제</span>${st}</button></li>`);
  }
  openModal(`<h2>지난 문제</h2><p class="sub">못 한 날 문제를 해 볼 수 있어요</p><ul class="past">${items.join('')}</ul>`);
}

function help() {
  openModal(`<h2>하는 방법</h2><div class="help">
    <p>날마다 <b>비밀 낱말</b>이 하나 있어요. 우리 반 모두 같은 낱말이에요.</p>
    <p>아무 낱말이나 써 보세요. 비밀 낱말과 <b>뜻이 얼마나 가까운지</b> 점수가 나와요. 점수가 높을수록 가까워요.</p>
    <p class="ex">비밀 낱말이 「바다」라면 「바닷가」「파도」는 점수가 높고, 「연필」은 낮아요.</p>
    <p>비밀 낱말과 가장 가까운 낱말 1000개 안에 들면 <b>몇 번째로 가까운지</b>도 알려 줘요. 숫자가 작을수록 정답에 가까워요.</p>
    <p>모르는 낱말이 나오면 다른 말로 바꿔 써 보세요. 「바다에서」처럼 써도 「바다」로 알아들어요.</p>
    <p>막히면 <b>힌트</b>를 쓸 수 있어요. 힌트를 쓰면 기록에 남아요.</p>
    <p>비밀 낱말은 한국 시간 밤 12시에 바뀌어요.</p></div>
    <div class="row-btns"><button class="btn red small" data-go="close">시작하기</button></div>`);
}

function openModal(html) {
  $('#mBody').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }

function confetti() {
  const box = $('#confetti');
  const colors = ['#e4572e', '#f0a23b', '#f0cf86', '#b23b30', '#2f7f6f', '#f6b7c0'];
  let html = '';
  for (let k = 0; k < 70; k++) {
    html += `<i style="left:${Math.random() * 100}%;background:${colors[k % colors.length]};--dx:${(Math.random() * 160 - 80).toFixed(0)}px;--rot:${(Math.random() * 720).toFixed(0)}deg;animation-duration:${(2.2 + Math.random() * 2).toFixed(2)}s;animation-delay:${(Math.random() * .6).toFixed(2)}s"></i>`;
  }
  box.innerHTML = html;
  setTimeout(() => { box.innerHTML = ''; }, 5000);
}

// ---------- 시작 ----------
async function start() {
  try {
    const [w, sched] = await Promise.all([getJSON('data/words.json'), getJSON('data/schedule.json')]);
    S.words = w.words;
    S.words.forEach((x, i) => S.index.set(x, i));
    S.show = b64bytes(w.show);
    SCHED = sched;
    await loadPuzzle(pickPuzzle());
  } catch (e) {
    say('문제를 불러오지 못했어요. 인터넷 연결을 확인하고 새로 고침 해 주세요.');
    console.error(e);
    return;
  }
  render();
  if (S.game.done) setTimeout(showWin, 200);
  else if (!load('seenHelp', false)) { save('seenHelp', true); help(); }

  $('#guessForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#guess').value; $('#guess').value = ''; submit(v); $('#guess').focus(); });
  $('#btnHint').addEventListener('click', useHint);
  $('#btnGiveUp').addEventListener('click', giveUp);
  $('#btnStats').addEventListener('click', stats);
  $('#btnPast').addEventListener('click', past);
  $('#btnHelp').addEventListener('click', help);
  $('#mClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') return closeModal();
    const go = e.target.closest('[data-go]');
    if (go) return go.dataset.go === 'past' ? past() : go.dataset.go === 'stats' ? stats() : closeModal();
    const day = e.target.closest('[data-day]');
    if (day) location.search = day.dataset.day === kstToday() ? '' : '?d=' + day.dataset.day;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  if (!S.game.done && matchMedia('(pointer: fine)').matches) $('#guess').focus();
}

window.__kk = S; // 시험 도구용
start();
