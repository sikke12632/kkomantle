// 우리반 꼬맨틀 — 선생님 화면
// 판 열기·닫기, 설정(공개 간격·저절로 다시), 맞힌 아이의 한마디 보기(급하면 지우기).
// 아침 첫 판·공개·저절로 다시는 아이 기기도 맡는다(app.js 판의 시계). 이 화면이 꺼져 있어도 판은 돈다.
// 접근 규칙이 선생님 계정(TEACHER_EMAIL)만 판을 바꾸게 막는다.
import {
  $, HOT_RANK, esc, mmss, korDate, roomId, getJSON, loadWords, loadPuzzle, codeForDate, kstToday,
  isAnswer, findAnswer, tier, confetti, josa, load, save, usedCodes, nextCode, topWords, mergeTop, DEFAULTS,
} from './common.js?v=10';
import { B, TEACHER_EMAIL } from './fb.js?v=10';

const ROOM = roomId();
const TOP_N = 3;
const S = { W: null, sched: null, room: null, players: [], notes: [], P: null, answer: '', pick: 0, peek: false, unsub: [], revealing: false, autoOpening: false, realSolve: 0, lastSolved: 0, seq: 0 };

// ---------- 들어가기 ----------
function showLogin(msg = '') { $('#login').hidden = false; $('#desk').hidden = true; $('#btnOut').hidden = true; $('#loginMsg').textContent = msg; }

async function enter(email) {
  if (email !== TEACHER_EMAIL) {
    showLogin(email ? `${email} 계정은 선생님 계정이 아니에요. 선생님 계정으로 다시 들어가 주세요.` : '');
    return;
  }
  $('#login').hidden = true; $('#desk').hidden = false; $('#btnOut').hidden = false;
  if (S.unsub.length) return;
  B.getSettings().then((st) => { if (st && (!S.room || S.room.state === 'closed')) { $('#revealEvery').value = String(st.revealEvery ?? DEFAULTS.revealEvery); $('#autoNext').value = String(st.autoNext ?? DEFAULTS.autoNext); } }).catch(() => {});
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
// 다음 낱말 고르기는 아이 화면과 같은 계산(common.js nextCode). S.pick 은 「다른 낱말로」를 누른 횟수.
const usedToday = () => usedCodes(S.room);
const candidateCode = () => nextCode(S.sched, S.room, S.pick);

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
  if (room && room.autoNext !== undefined) $('#autoNext').value = String(room.autoNext);
  // 아이가 올린 '맞힘'이 진짜 정답이 아니면 판을 다시 연다
  if (solved && !(await solveIsReal(room))) {
    console.warn('가짜 맞힘이라 판을 다시 엶', room.code, room.answer, room.solvedNum);
    await B.updateRoom(ROOM, { state: 'open', answer: null, solvedNum: null, solvedUid: null, solvedAt: null });
    return;
  }
  if (seq !== S.seq) return;
  if (solved) S.realSolve = room.solvedAt;
  renderKids();
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
  saveSettings();
  await B.setRoom(ROOM, {
    state: 'open', code: S.P.code, openedAt: now, top: [], topAt: now, revealEvery: +$('#revealEvery').value, autoNext: +$('#autoNext').value,
    answer: null, solvedNum: null, solvedUid: null, solvedAt: null, message: null, used: [...new Set(used)],
  });
  S.pick = 0;
}
async function closeRoom() {
  if (!confirm('오늘 판을 닫을까요? 아이들 화면에 "오늘 판은 끝났어요"가 떠요.')) return;
  await B.updateRoom(ROOM, { state: 'closed' });
}

// ---------- 반이 찾은 가장 가까운 낱말 공개 ----------
// 아이 기기도 똑같이 공개한다(선생님 화면이 꺼져 있어도 돌게). 이 화면은 켜져 있으면 같이 거든다.
const classTop = () => mergeTop(S.room.top, topWords(S.players, S.P, S.W, S.room.openedAt, TOP_N), TOP_N);
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
  // 누가 맞히고 정해진 시간이 지나면 오늘 안 쓴 새 낱말로 저절로 다시 연다(이 화면이 켜져 있어야 한다)
  // 이 화면이 진짜 정답으로 확인한 맞힘(S.realSolve)일 때만 센다
  if (r && r.state === 'solved' && r.autoNext && typeof r.solvedAt === 'number' && S.realSolve === r.solvedAt) {
    const left = r.solvedAt + r.autoNext * 60e3 - Date.now();
    const el = $('#autoLeft');
    if (el) el.textContent = `${mmss(left)} 뒤에 새 낱말로 저절로 다시 열려요.`;
    if (left <= 0 && !S.autoOpening) {
      S.autoOpening = true;
      const at = r.solvedAt;
      (S.room && S.room.state === 'solved' && S.room.solvedAt === at ? openRoom() : Promise.resolve())
        .catch((e) => console.error(e)).finally(() => { S.autoOpening = false; });
    }
  }
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
  $('#noteArea').innerHTML = html + (r.autoNext ? '<p id="autoLeft" class="sub left small"></p>' : '');
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
  const round = S.room && S.room.openedAt;
  const rows = S.players.filter((p) => p.round === round).sort((a, b) => ((a.best && a.best[0] ? a.best[0].r : 1e9) - (b.best && b.best[0] ? b.best[0].r : 1e9)) || a.num - b.num);
  $('#kidCount').textContent = `${rows.length}명`;
  const nums = rows.map((p) => p.num);
  const dup = [...new Set(nums.filter((n, k) => nums.indexOf(n) !== k))];
  $('#dupWarn').textContent = dup.length ? `같은 번호가 둘 이상: ${dup.join(', ')}번` : '';
  $('#kids').innerHTML = rows.map((p) => {
    const b = p.best && p.best[0];
    return `<tr><td>${p.num}번</td><td>${p.count || 0}개</td><td>${b ? `${esc(b.w)} <span class="tag t${tier(b.r)}">${b.r <= HOT_RANK ? b.r + '위' : '1000위 밖'}</span>` : '-'}</td></tr>`;
  }).join('') || '<tr><td colspan="3" class="sub">아직 들어온 아이가 없어요.</td></tr>';
}

// 아이 기기가 아침 첫 판을 열 때 쓰는 설정(공개 간격, 저절로 다시)
function saveSettings() { B.setSettings({ revealEvery: +$('#revealEvery').value, autoNext: +$('#autoNext').value }).catch((e) => console.error(e)); }

// ---------- 시작 ----------
async function start() {
  $('#roomName').textContent = ROOM === kstToday() ? `(${korDate(ROOM)})` : `(${ROOM})`;
  const kid = new URL('./', location.href);
  if (B.mock) kid.search = '?mock';
  if (ROOM !== kstToday()) { if (!B.mock) kid.searchParams.set('test', ''); kid.searchParams.set('room', ROOM); }
  $('#kidLink').href = $('#kidLink').textContent = kid.href;
  [S.W, S.sched] = await Promise.all([loadWords(), getJSON('data/schedule.json')]);
  await usePuzzle(codeForDate(S.sched, kstToday()));

  $('#autoNext').value = String(load('autoNext', 10));
  $('#btnLogin').addEventListener('click', async () => {
    try { enter(await B.signInTeacher()); } catch (e) { showLogin('들어가지 못했어요: ' + (e.code || e.message)); }
  });
  $('#btnOut').addEventListener('click', async () => { await B.signOut(); location.reload(); });
  $('#btnOpen').addEventListener('click', () => openRoom().catch((e) => alert('판을 열지 못했어요: ' + (e.code || e.message))));
  $('#btnClose').addEventListener('click', () => closeRoom().catch((e) => alert('판을 닫지 못했어요: ' + (e.code || e.message))));
  $('#btnPeek').addEventListener('click', () => { S.peek = !S.peek; renderWord(); });
  $('#btnOther').addEventListener('click', async () => { S.pick++; await usePuzzle(candidateCode()); });
  $('#btnReveal').addEventListener('click', () => reveal());
  $('#autoNext').addEventListener('change', () => { save('autoNext', +$('#autoNext').value); saveSettings(); if (S.room && S.room.state !== 'closed') B.updateRoom(ROOM, { autoNext: +$('#autoNext').value }); });
  $('#revealEvery').addEventListener('change', () => { saveSettings(); if (S.room && S.room.state === 'open') B.updateRoom(ROOM, { revealEvery: +$('#revealEvery').value }); });
  $('#noteArea').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) noteAct(b.dataset.act).catch((er) => alert(er.code || er.message)); });

  B.onAuth((email) => (email ? enter(email) : showLogin()));
}

window.__kt = S; // 시험 도구용
start();
