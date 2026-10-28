// 우리반 꼬맨틀 — 선생님 화면
// 판 열기·닫기, 정해진 시간마다 반이 찾은 가장 가까운 낱말 공개, 맞힌 아이의 한마디 보기(급하면 지우기).
// 접근 규칙이 선생님 계정(TEACHER_EMAIL)만 판을 바꾸게 막는다.
import {
  $, HOT_RANK, esc, mmss, korDate, roomId, getJSON, loadWords, loadPuzzle, codeForDate, kstToday,
  isAnswer, findAnswer, isShown, tier, confetti, josa,
} from './common.js?v=5';
import { B, TEACHER_EMAIL } from './fb.js?v=5';

const ROOM = roomId();
const TOP_N = 3;
const S = { W: null, sched: null, room: null, players: [], notes: [], P: null, answer: '', pick: 0, peek: false, unsub: [], revealing: false, lastSolved: 0, seq: 0 };

// ---------- 들어가기 ----------
function showLogin(msg = '') { $('#login').hidden = false; $('#desk').hidden = true; $('#btnOut').hidden = true; $('#loginMsg').textContent = msg; }

async function enter(email) {
  if (email !== TEACHER_EMAIL) {
    showLogin(email ? `${email} 계정은 선생님 계정이 아니에요. 선생님 계정으로 다시 들어가 주세요.` : '');
    return;
  }
  $('#login').hidden = true; $('#desk').hidden = false; $('#btnOut').hidden = false;
  if (S.unsub.length) return;
  S.unsub.push(
    B.onRoom(ROOM, onRoom, (e) => fail(e)),
    B.onPlayers(ROOM, (p) => { S.players = p; renderKids(); }, (e) => fail(e)),
    B.onNotes(ROOM, (n) => { S.notes = n; }, (e) => fail(e)), // 예전 검토용 칸: 새 판을 열 때 지우려고만 본다
  );
}
function fail(e) { console.error(e); $('#stateBadge').textContent = '서버 연결 문제'; $('#stateBadge').className = 'badge bad'; }

// ---------- 오늘 판 ----------
async function usePuzzle(code) {
  if (S.P && S.P.code === code) return;
  S.P = await loadPuzzle(code);
  S.answer = findAnswer(S.P, S.W);
  renderWord();
}
// 오늘 이미 쓴 낱말(판 문서의 used + 지금 낱말). 하루에 여러 판을 해도 같은 낱말이 다시 나오지 않게.
function usedToday() {
  const u = new Set((S.room && S.room.used) || []);
  if (S.room && S.room.code) u.add(S.room.code);
  return u;
}
// 다음 낱말: 오늘 순서표 낱말부터, 그 뒤는 순서표에서 멀리 떨어진 낱말. 오늘 쓴 것은 건너뛴다.
// 주제도 골고루: 오늘 이미 나온 주제(동물·음식·역사…)는 다른 주제를 다 돌 때까지 건너뛴다.
// S.pick 은 「다른 낱말로」를 누른 횟수만큼 더 건너뛴다.
function candidateCode() {
  const n = Math.max(0, Math.round((new Date(kstToday()) - new Date(S.sched.start)) / 864e5));
  const L = S.sched.days.length, used = usedToday(), topics = S.sched.topics || {};
  const usedTopics = new Set([...used].map((c) => topics[c]).filter(Boolean));
  for (const freshTopic of [true, false]) {
    let skip = S.pick;
    for (let k = 0; k < L; k++) {
      const c = S.sched.days[(n + k * 97) % L];
      if (used.has(c) || (freshTopic && k > 0 && usedTopics.has(topics[c]))) continue;
      if (skip-- === 0) return c;
    }
  }
  return S.sched.days[n % L];
}

async function onRoom(room) {
  S.room = room;
  const seq = ++S.seq;
  const open = room && room.state === 'open';
  const solved = room && room.state === 'solved';
  await usePuzzle(room && room.code && (open || solved) ? room.code : candidateCode());
  if (seq !== S.seq) return; // 기다리는 동안 더 새 판 소식이 왔으면 그것만 그린다
  $('#stateBadge').textContent = !room ? '아직 안 열었어요' : open ? '아이들이 푸는 중' : solved ? '맞혔어요!' : '닫혔어요';
  $('#stateBadge').className = 'badge ' + (open ? 'live' : solved ? 'win' : '');
  $('#btnOpen').textContent = room && room.state !== 'closed' ? '새 낱말로 다시 시작' : '판 열기';
  $('#btnClose').disabled = !room || room.state === 'closed';
  $('#btnOther').hidden = open || solved;
  if (room && room.revealEvery !== undefined) $('#revealEvery').value = String(room.revealEvery);
  // 아이가 올린 '맞힘'이 진짜 정답이 아니면 판을 다시 연다
  if (solved && !(await solveIsReal(room))) {
    console.warn('가짜 맞힘이라 판을 다시 엶', room.code, room.answer, room.solvedNum);
    await B.updateRoom(ROOM, { state: 'open', answer: null, solvedNum: null, solvedUid: null, solvedAt: null });
    return;
  }
  if (seq !== S.seq) return;
  renderTop();
  renderSolved();
}

// 그 판의 문제로 확인하고, 아니면 2초 뒤 가장 새 판 소식으로 한 번 더 확인한다(잘못 다시 여는 일이 없게)
async function solveIsReal(room) {
  const P = S.P && S.P.code === room.code ? S.P : await loadPuzzle(room.code);
  if (isAnswer(P, room.answer)) return true;
  await new Promise((r) => setTimeout(r, 2000));
  const cur = S.room;
  if (!cur || cur.state !== 'solved' || cur.solvedAt !== room.solvedAt) return true;
  return isAnswer(P, cur.answer);
}

function renderWord() {
  $('#answerWord').textContent = S.peek ? S.answer : '●'.repeat(Math.max(2, S.answer.length));
  $('#answerWord').classList.toggle('secret', !S.peek);
  $('#btnPeek').textContent = S.peek ? '가리기' : '보기';
}

// 판 열기. 판이 열려 있거나 누가 맞힌 뒤라면 「새 낱말로 다시 시작」: 오늘 안 쓴 새 낱말로 바로 새 판을 연다.
async function openRoom() {
  const r = S.room;
  const again = r && r.state !== 'closed';
  if (r && r.state === 'open' && !confirm('아직 아무도 못 맞혔어요. 새 낱말로 바꿔서 다시 시작할까요? 지금 판의 기록은 사라져요.')) return;
  if (again) S.pick = 0;
  // 닫자마자 바로 열 때 다음 낱말이 아직 안 불러와졌어도, 오늘 쓴 낱말은 다시 열지 않는다
  if (again || usedToday().has(S.P.code)) await usePuzzle(candidateCode());
  const used = [...usedToday(), S.P.code];
  if (r && S.players.length + S.notes.length) await B.clearRoom(ROOM);
  const now = Date.now();
  await B.setRoom(ROOM, {
    state: 'open', code: S.P.code, openedAt: now, top: [], topAt: now, revealEvery: +$('#revealEvery').value,
    answer: null, solvedNum: null, solvedUid: null, solvedAt: null, message: null, used: [...new Set(used)],
  });
  S.pick = 0;
}
async function closeRoom() {
  if (!confirm('오늘 판을 닫을까요? 아이들 화면에 "오늘 판은 끝났어요"가 떠요.')) return;
  await B.updateRoom(ROOM, { state: 'closed' });
}

// ---------- 반이 찾은 가장 가까운 낱말 공개 ----------
function classTop() {
  const best = new Map();
  for (const p of S.players) for (const x of p.best || []) {
    const i = S.W.index.get(x.w);
    // 게임이 보여 줘도 되는 낱말만 모두에게 공개한다
    if (i === undefined || !isShown(S.W, i) || !S.P || isAnswer(S.P, x.w)) continue;
    const r = S.P.rankOf[i];
    if (!best.has(x.w) || best.get(x.w) > r) best.set(x.w, r);
  }
  return [...best].map(([w, r]) => ({ w, r })).sort((a, b) => a.r - b.r).slice(0, TOP_N);
}
async function reveal() {
  if (!S.room || S.room.state !== 'open') return;
  await B.updateRoom(ROOM, { top: classTop(), topAt: Date.now() });
}
function renderTop() {
  const top = (S.room && S.room.top) || [];
  $('#tTop').innerHTML = top.length
    ? top.map((x) => `<span class="ct-chip t${tier(x.r)}"><b>${esc(x.w)}</b><i>${x.r <= HOT_RANK ? x.r + '위' : '1000위 밖'}</i></span>`).join('')
    : '<span class="ct-empty">아직 공개한 낱말이 없어요.</span>';
}

// 1초마다: 흐른 시간, 공개할 때가 되면 공개
setInterval(() => {
  const r = S.room;
  if (!r || r.state !== 'open') { $('#tElapsed').textContent = ''; $('#revealNext').textContent = ''; return; }
  $('#tElapsed').textContent = `시작하고 ${mmss(Date.now() - r.openedAt)}`;
  if (!r.revealEvery) { $('#revealNext').textContent = '자동 공개를 껐어요.'; return; }
  const left = (r.topAt || r.openedAt) + r.revealEvery * 1000 - Date.now();
  $('#revealNext').textContent = `다음 공개까지 ${mmss(left)}`;
  if (left <= 0 && !S.revealing) { S.revealing = true; reveal().finally(() => { S.revealing = false; }); }
}, 1000);

// ---------- 맞힌 아이와 한마디 ----------
function renderSolved() {
  const r = S.room;
  const card = $('#solvedCard');
  card.hidden = !(r && r.state === 'solved');
  if (card.hidden) return;
  if (S.lastSolved !== r.solvedAt) { S.lastSolved = r.solvedAt; confetti(60); }
  $('#solvedHead').innerHTML = `🎉 <b>${r.solvedNum}번</b>이 비밀 낱말 「${esc(r.answer)}」${josa(r.answer, '을', '를')} 찾았어요! (시작하고 ${mmss(r.solvedAt - r.openedAt)})`;
  let html;
  if (r.message && r.message.removed) {
    html = `<p class="sub left">한마디를 아이들 화면에서 지웠어요.</p>
      <div class="t-btns again"><button class="btn red" data-act="newRound">새 낱말로 한 판 더!</button><button class="btn dark small" data-act="closeRoom">판 닫기</button></div>`;
  } else if (r.message) {
    html = `<p class="sub left">${r.solvedNum}번의 한마디가 아이들 화면에 떴어요.</p><p class="note-big">“${esc(r.message.text)}”</p>
      <div class="t-btns"><button class="btn dark small" data-act="again">한 번 더 띄우기</button>
      <button class="btn ghost small" data-act="remove">화면에서 지우기</button></div>
      <div class="t-btns again"><button class="btn red" data-act="newRound">새 낱말로 한 판 더!</button><button class="btn dark small" data-act="closeRoom">판 닫기</button></div>`;
  } else {
    html = `<p class="sub left">${r.solvedNum}번이 친구들에게 보낼 한마디를 쓰고 있어요… 다 쓰면 바로 모두의 화면에 떠요.</p>
      <div class="t-btns again"><button class="btn dark small" data-act="newRound">기다리지 않고 새 낱말로 한 판 더</button></div>`;
  }
  $('#noteArea').innerHTML = html;
}

// 한마디는 선생님 검토 없이 바로 뜬다(담임 결정). 선생님은 다시 띄우거나, 급할 때 지울 수만 있다.
async function noteAct(act) {
  const r = S.room;
  if (act === 'again' && r.message) await B.updateRoom(ROOM, { message: { text: r.message.text, at: Date.now() } });
  if (act === 'remove' && confirm('아이들 화면에서 한마디를 지울까요?')) await B.updateRoom(ROOM, { message: { text: '', at: Date.now(), removed: true } });
  if (act === 'closeRoom') await closeRoom();
  if (act === 'newRound') await openRoom();
}

// ---------- 아이들 ----------
function renderKids() {
  const rows = [...S.players].sort((a, b) => ((a.best && a.best[0] ? a.best[0].r : 1e9) - (b.best && b.best[0] ? b.best[0].r : 1e9)) || a.num - b.num);
  $('#kidCount').textContent = `${rows.length}명`;
  const nums = rows.map((p) => p.num);
  const dup = [...new Set(nums.filter((n, k) => nums.indexOf(n) !== k))];
  $('#dupWarn').textContent = dup.length ? `같은 번호가 둘 이상: ${dup.join(', ')}번` : '';
  $('#kids').innerHTML = rows.map((p) => {
    const b = p.best && p.best[0];
    return `<tr><td>${p.num}번</td><td>${p.count || 0}개</td><td>${b ? `${esc(b.w)} <span class="tag t${tier(b.r)}">${b.r <= HOT_RANK ? b.r + '위' : '1000위 밖'}</span>` : '-'}</td></tr>`;
  }).join('') || '<tr><td colspan="3" class="sub">아직 들어온 아이가 없어요.</td></tr>';
}

// ---------- 시작 ----------
async function start() {
  $('#roomName').textContent = ROOM === kstToday() ? `(${korDate(ROOM)})` : `(${ROOM})`;
  const kid = new URL('./', location.href);
  if (B.mock) kid.search = '?mock';
  if (ROOM !== kstToday()) { if (!B.mock) kid.searchParams.set('test', ''); kid.searchParams.set('room', ROOM); }
  $('#kidLink').href = $('#kidLink').textContent = kid.href;
  [S.W, S.sched] = await Promise.all([loadWords(), getJSON('data/schedule.json')]);
  await usePuzzle(codeForDate(S.sched, kstToday()));

  $('#btnLogin').addEventListener('click', async () => {
    try { enter(await B.signInTeacher()); } catch (e) { showLogin('들어가지 못했어요: ' + (e.code || e.message)); }
  });
  $('#btnOut').addEventListener('click', async () => { await B.signOut(); location.reload(); });
  $('#btnOpen').addEventListener('click', () => openRoom().catch((e) => alert('판을 열지 못했어요: ' + (e.code || e.message))));
  $('#btnClose').addEventListener('click', () => closeRoom().catch((e) => alert('판을 닫지 못했어요: ' + (e.code || e.message))));
  $('#btnPeek').addEventListener('click', () => { S.peek = !S.peek; renderWord(); });
  $('#btnOther').addEventListener('click', async () => { S.pick++; await usePuzzle(candidateCode()); });
  $('#btnReveal').addEventListener('click', () => reveal());
  $('#revealEvery').addEventListener('change', () => { if (S.room && S.room.state === 'open') B.updateRoom(ROOM, { revealEvery: +$('#revealEvery').value }); });
  $('#noteArea').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) noteAct(b.dataset.act).catch((er) => alert(er.code || er.message)); });

  B.onAuth((email) => (email ? enter(email) : showLogin()));
}

window.__kt = S; // 시험 도구용
start();
