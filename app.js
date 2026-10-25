// 우리반 꼬맨틀 — 아이 화면 (반이 함께 푸는 판)
// 선생님이 판을 열면 모두 같은 비밀 낱말을 푼다. 한 명이 맞히면 모두에게 정답이 열리고,
// 맞힌 아이가 반 친구들에게 따뜻한 한마디를 쓰면 바로 모두의 화면에 크게 뜬다(금지어는 막는다).
import {
  $, HOT_RANK, NUM_GROUPS, isNum, load, save, esc, fmt, josa, ro, korDate, kstToday, mmss, roomId, loadWords, loadPuzzle,
  isAnswer, nearest, normalize, tier, SAY, heatOf, coldSay, heatCell, confetti, b64bytes,
} from './common.js?v=4';
import { B } from './fb.js?v=4';
import { BAN } from './ban.js?v=4';

const ROOM = roomId();
const S = { W: null, P: null, uid: '', num: isNum(load('num', 0)) ? load('num', 0) : 0, room: null, round: '', game: null, modal: '', sending: false };
let syncTimer = 0;

// ---------- 화면 고르기: num(번호 넣기) / wait(기다림) / play(푸는 중) / solved(누군가 맞힘) ----------
function view(name) {
  const playing = name === 'play' || name === 'solved';
  $('#numForm').hidden = name !== 'num';
  $('#guessForm').hidden = name !== 'play';
  $('#meter').hidden = !playing;
  if (!playing) $('#latest').hidden = $('#listCard').hidden = $('#classTop').hidden = true;
  if (!playing) $('#scale').textContent = '';
}

function hero(title, sub) { $('#heroTitle').textContent = title; $('#heroSub').innerHTML = sub; }

function say(text, ok = false) { const m = $('#msg'); m.textContent = text; m.className = ok ? 'ok' : ''; }

// ---------- 출석 번호 ----------
function askNumber() {
  view('num');
  hero('반갑습니다!', '꼬맨틀을 하려면 먼저 내 출석 번호를 눌러 주세요.');
  $('#numGrid').innerHTML = NUM_GROUPS.map(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k)
    .map((n) => `<button type="button" class="numkey${S.num === n ? ' on' : ''}" data-n="${n}">${n}</button>`).join(''))
    .join('<div class="numgap"></div>');
}
function setNumber(n) {
  S.num = n;
  save('num', n);
  $('#btnNum').hidden = false;
  $('#btnNum').textContent = `${n}번`;
  onRoom(S.room).catch((e) => console.error(e));
}

// ---------- 판 따라가기 ----------
async function onRoom(room) {
  // 서버가 아직 확인하지 않은 내 쓰기는 그리지 않는다(금지어로 거절된 한마디가 내 화면에 잠깐 뜨지 않게)
  if (room && room._pending) return;
  S.room = room;
  if (!S.num) return askNumber();
  $('#dayChip').textContent = `${korDate(kstToday())} 반 판`;
  if (!room || room.state === 'closed' || !room.code) {
    view('wait');
    closeModal('reveal');
    document.documentElement.style.setProperty('--heat', 0.12);
    const ended = room && room.state === 'closed';
    hero(ended ? '오늘 판은 끝났어요' : '선생님이 판을 열면 시작해요',
      ended ? '내일 또 만나요!' : '조용히 기다려 주세요. 판이 열리면 이 화면이 저절로 바뀌어요.');
    return;
  }
  // 판 한 번 = 문제 코드 + 연 시각. 선생님이 같은 낱말로 새로 열어도 새 판으로 시작한다.
  const round = `${room.code}:${room.openedAt}`;
  if (S.round !== round) {
    hero('문제를 펼치는 중이에요…', '');
    if (!S.P || S.P.code !== room.code) S.P = await loadPuzzle(room.code);
    S.round = round;
    S.game = load(`game:${ROOM}:${round}`, null) || { guesses: [], done: false, tries: 0 };
    if (S.modal !== 'help') closeModal(); // 처음 온 아이의 '하는 방법'은 남겨 둔다
    $('#shout').hidden = true;
    $('#latest').hidden = true;
    say('');
  }
  // 맞힌 낱말이 진짜 정답인지 이 화면에서 다시 확인한다(가짜 '맞힘'은 무시)
  if (room.state === 'solved' && isAnswer(S.P, room.answer)) {
    view('solved');
    render();
    document.documentElement.style.setProperty('--heat', 1);
    hero(room.solvedUid === S.uid ? '내가 비밀 낱말을 찾았어요!' : `${room.solvedNum}번 친구가 찾았어요!`,
      `오늘의 비밀 낱말은 <b>「${esc(room.answer)}」</b>였어요.`);
    if (room.solvedUid === S.uid) showMine(room); else showReveal(room);
  } else {
    view('play');
    closeModal('reveal');
    $('#guess').disabled = $('#btnGo').disabled = S.game.done;
    render();
  }
  renderTop(room);
  if (room.message && room.message.at > load('seenMsg:' + ROOM, 0)) shout(room.message);
}

// ---------- 그리기 ----------
function render(lastI = -1) {
  const P = S.P, g = S.game;
  if (S.room.state === 'open') {
    const best = g.guesses.reduce((m, x) => Math.max(m, heatOf(P, x.i)), 0);
    document.documentElement.style.setProperty('--heat', (best * 0.9).toFixed(3)); // 다 밝아지는 건 맞혔을 때만
    hero('우리 반 비밀 낱말을 찾아라!', `아무 낱말이나 써 보세요. 비밀 낱말과 뜻이 가까울수록 점수가 높고 등불이 밝아져요. <span id="elapsed" class="elapsed"></span>`);
  }
  const s = (r) => fmt(P.scores[P.order[r - 1]]);
  $('#scale').innerHTML = `가장 가까운 낱말은 <b>${s(1)}</b>점, 10번째는 <b>${s(10)}</b>점, 1000번째는 <b>${s(1000)}</b>점이에요.`;

  const latest = $('#latest');
  const last = lastI >= 0 ? g.guesses.find((x) => x.i === lastI) : null;
  if (last) {
    const t = tier(P.rankOf[last.i]);
    latest.hidden = false;
    latest.style.borderColor = t === 1 ? '#e4572e' : t === 2 ? '#f08a3b' : t === 3 ? '#f0c25b' : 'transparent';
    latest.innerHTML = `<div class="lt-main"><div class="lt-word">${esc(last.w)}</div>
      <div class="lt-score">점수 <b>${fmt(P.scores[last.i])}</b> · <span class="lt-say">${SAY[t] || coldSay(P, last.i)}</span></div></div>
      <div class="lt-heat">${heatCell(P, last.i)}</div>`;
    latest.classList.remove('pop'); void latest.offsetWidth; latest.classList.add('pop');
  } else if (!g.guesses.length) latest.hidden = true;

  const rows = [...g.guesses].sort((a, b) => P.scores[b.i] - P.scores[a.i]);
  $('#listCard').hidden = !rows.length;
  $('#count').textContent = `${g.guesses.length}개`;
  $('#list tbody').innerHTML = rows.map((x) =>
    `<tr class="${x.i === lastI ? 'now' : ''}"><td class="c-n">${x.n}</td><td class="w">${esc(x.w)}</td><td class="s">${fmt(P.scores[x.i])}</td><td>${heatCell(P, x.i)}</td></tr>`).join('');
}

function renderTop(room) {
  const box = $('#classTop');
  const top = room.top || [];
  box.hidden = !(room.state === 'open' && (top.length || room.revealEvery));
  if (box.hidden) return;
  const key = JSON.stringify(top);
  $('#ctWords').innerHTML = top.length
    ? top.map((x) => `<span class="ct-chip t${tier(x.r)}"><b>${esc(x.w)}</b><i>${x.r <= HOT_RANK ? x.r + '위' : '1000위 밖'}</i></span>`).join('')
    : '<span class="ct-empty">아직 없어요. 곧 친구들이 찾은 낱말이 떠요!</span>';
  if (box.dataset.key !== key) { box.dataset.key = key; box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash'); }
}

// 1초마다: 흐른 시간, 다음 공개까지 남은 시간
setInterval(() => {
  const r = S.room;
  if (!r || r.state !== 'open') return;
  const el = $('#elapsed');
  if (el && r.openedAt) el.textContent = `· 시작하고 ${mmss(Date.now() - r.openedAt)}`;
  $('#ctNext').textContent = r.revealEvery ? `다음 공개까지 ${mmss((r.topAt || r.openedAt) + r.revealEvery * 1000 - Date.now())}` : '';
}, 1000);

// ---------- 낱말 넣기 ----------
function submit(raw) {
  const g = S.game, P = S.P;
  if (!P || !S.room || S.room.state !== 'open' || g.done) return;
  const { w, i } = normalize(raw, S.W);
  if (!w) return;
  if (!/^[가-힣]+$/.test(w)) { say('한글 낱말로 써 주세요.'); shake(); return; }
  if (isAnswer(P, w)) { win(w, i); return; }
  // 모르는 낱말은 되풀이해 보여 주지 않는다(거친 말이 화면에 뜨지 않게)
  if (i < 0) { say('모르는 낱말이에요. 다른 낱말을 써 보세요.'); shake(); return; }
  if (g.guesses.find((x) => x.i === i)) { say(`「${w}」${josa(w, '은', '는')} 벌써 썼어요.`); render(i); return; }
  g.tries++;
  g.guesses.push({ i, w, n: g.guesses.length + 1 });
  say(w !== raw.trim() ? `「${w}」${ro(w)} 알아들었어요.` : '', true);
  save(`game:${ROOM}:${S.round}`, g);
  render(i);
  syncSoon();
}
function shake() { shakeEl('#guessForm'); }
function shakeEl(sel) { const f = $(sel); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); }

// 내 가장 가까운 낱말 5개를 선생님 화면으로 보낸다(잠깐 모아서 한 번에)
function syncSoon() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const P = S.P, g = S.game;
    const best = [...g.guesses].sort((a, b) => P.scores[b.i] - P.scores[a.i]).slice(0, 5).map((x) => ({ w: x.w, r: P.rankOf[x.i] }));
    B.setPlayer(ROOM, S.uid, { num: S.num, best, count: g.guesses.length, at: Date.now() }).catch(() => {});
  }, 1200);
}

async function win(w, i) {
  const g = S.game;
  g.tries++;
  g.done = true;
  if (i >= 0) g.guesses.push({ i, w, n: g.guesses.length + 1 });
  save(`game:${ROOM}:${S.round}`, g);
  $('#guess').disabled = $('#btnGo').disabled = true;
  try {
    await B.updateRoom(ROOM, { state: 'solved', answer: w, solvedNum: S.num, solvedUid: S.uid, solvedAt: Date.now() });
    confetti(90);
  } catch {
    say('아쉬워요! 다른 친구가 조금 먼저 찾았어요.');
  }
}

// ---------- 맞힌 뒤 ----------
function answerBlock(room) {
  return `<div class="answer">${esc(room.answer)}</div>${S.P.gloss ? `<p class="gloss">${esc(S.P.gloss)}</p>` : ''}
    <h3>비밀 낱말과 가장 가까운 낱말 10개</h3>
    <ol class="near">${nearest(S.P, S.W, 10).map((i) => `<li>${esc(S.W.words[i])}<span>${fmt(S.P.scores[i])}</span></li>`).join('')}</ol>`;
}

function showReveal(room) {
  if (S.modal === 'reveal') return;
  confetti(50);
  openModal('reveal', `<h2>${room.solvedNum}번 친구가 찾았어요!</h2><p class="sub">오늘의 비밀 낱말은</p>
    ${answerBlock(room)}
    <p class="sub" style="margin-top:14px">나는 낱말을 ${S.game.guesses.length}개 써 봤어요. 친구가 곧 따뜻한 한마디를 보내 줄 거예요.</p>`);
}

function showMine(room) {
  if (room.message) {
    if (S.modal === 'shown') return;
    openModal('shown', `<h2>친구들 화면에 떴어요!</h2>
      <p class="sub">내 한마디가 우리 반 모두의 화면에 크게 떴어요. 고마워요!</p>
      ${answerBlock(room)}`);
    return;
  }
  if (S.modal === 'write') return;
  openModal('write', `<h2>축하해요! 비밀 낱말을 찾았어요!</h2>
    <p class="sub">${S.game.tries}번 만에 「${esc(room.answer)}」${josa(room.answer, '을', '를')} 찾았어요.</p>
    <div class="note-box">
      <label for="noteText"><b>우리 반 친구들에게 오늘 하루를 응원하는 따뜻한 한마디를 써 주세요.</b></label>
      <p class="note-warn">보내기를 누르면 <b>바로 우리 반 친구들 모두의 화면에 크게</b> 떠요. 깜짝 선물처럼 몰래 써 보세요!<br>
      친구들이 읽고 기분 좋아질 말로 써 주세요. 나쁜 말은 막혀 있어서 보낼 수 없어요.</p>
      <textarea id="noteText" maxlength="100" rows="3" placeholder="예: 오늘도 다 같이 힘내자! 너희가 있어서 학교 오는 게 즐거워."></textarea>
      <div class="note-foot"><span id="noteLen">0 / 100</span><button id="noteSend" class="btn red small" type="button">모두에게 보내기</button></div>
    </div>`, true);
  const ta = $('#noteText');
  ta.addEventListener('input', () => { $('#noteLen').textContent = `${ta.value.length} / 100`; $('#noteLen').classList.remove('bad'); });
  $('#noteSend').addEventListener('click', sendNote);
  ta.focus();
}

function noteWarn(text) { const el = $('#noteLen'); el.textContent = text; el.classList.add('bad'); }

async function sendNote() {
  const text = $('#noteText').value.replace(/\s+/g, ' ').trim();
  if (text.length < 5) { noteWarn('조금 더 길게 써 주세요'); return; }
  // 금지어가 있으면 보내지 않는다(어떤 낱말인지는 되풀이해 보여 주지 않는다). 서버 규칙도 한 번 더 막는다.
  if (hasBadWord(text)) { noteWarn('앗! 쓸 수 없는 말이 들어 있어요. 친구들이 기분 좋아질 말로 바꿔 볼까요?'); shakeEl('.note-box'); return; }
  if (S.sending) return;
  S.sending = true;
  try {
    await B.updateRoom(ROOM, { message: { text, at: Date.now() } });
  } catch {
    noteWarn('보내지 못했어요. 친구들이 기분 좋아질 말로 바꿔서 다시 보내 볼까요?');
  } finally { S.sending = false; }
}

// 한마디 금지어 검사: 소문자로 바꾸고 한글·영어 글자와 띄어쓰기만 남긴다(firestore.rules 의 okText 와 같은 방식)
const BANS = JSON.parse(new TextDecoder().decode(b64bytes(BAN)));
function hasBadWord(text) {
  const t = text.normalize('NFC').toLowerCase().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z ]/g, '');
  const glued = t.replace(/ /g, '');
  return BANS['붙여도'].some((w) => glued.includes(w)) || BANS['낱말안'].some((w) => t.includes(w));
}

// ---------- 오늘의 한마디 크게 띄우기 ----------
function shout(m) {
  save('seenMsg:' + ROOM, m.at);
  if (m.removed) { $('#shout').hidden = true; return; } // 선생님이 「화면에서 지우기」를 눌렀다
  $('#shoutText').textContent = m.text;
  const el = $('#shout');
  el.hidden = false;
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  confetti(120);
}

// ---------- 큰 창 ----------
function openModal(kind, html, sticky = false) {
  S.modal = kind;
  $('#mBody').innerHTML = html;
  $('#modal').hidden = false;
  $('#mClose').hidden = sticky;
}
function closeModal(kind) { if (kind && S.modal !== kind) return; S.modal = ''; $('#modal').hidden = true; }

function help() {
  openModal('help', `<h2>하는 방법</h2><div class="help">
    <p>선생님이 판을 열면 <b>우리 반 모두가 같은 비밀 낱말</b>을 찾아요.</p>
    <p>아무 낱말이나 써 보세요. 비밀 낱말과 <b>뜻이 얼마나 가까운지</b> 점수가 나와요. 점수가 높을수록 가까워요.</p>
    <p class="ex">비밀 낱말이 「바다」라면 「바닷가」「파도」는 점수가 높고, 「연필」은 낮아요.</p>
    <p>가장 가까운 낱말 1000개 안에 들면 <b>몇 번째로 가까운지</b>도 알려 줘요. 숫자가 작을수록 정답에 가까워요.</p>
    <p>조금씩 시간이 지나면 <b>우리 반 친구들이 찾은 가장 가까운 낱말</b>이 모두에게 공개돼요. 힌트로 써 보세요.</p>
    <p><b>한 명이 찾으면 오늘 판은 끝!</b> 찾은 친구는 반 친구들에게 따뜻한 한마디를 남겨요.</p>
    <p>말소리는 작게, 생각은 크게! 조용히 도전해요.</p></div>
    <div class="row-btns"><button class="btn red small" data-go="close">알겠어요</button></div>`);
}

// ---------- 시작 ----------
async function start() {
  $('#numGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) setNumber(+b.dataset.n); });
  $('#btnNum').addEventListener('click', () => { if (confirm('출석 번호를 바꿀까요?')) askNumber(); });
  $('#guessForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#guess').value; $('#guess').value = ''; submit(v); $('#guess').focus(); });
  $('#btnHelp').addEventListener('click', help);
  $('#mClose').addEventListener('click', () => closeModal());
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal' && !$('#mClose').hidden) return closeModal();
    if (e.target.closest('[data-go=close]')) closeModal();
  });
  $('#shoutClose').addEventListener('click', () => { $('#shout').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#mClose').hidden) closeModal(); });

  try {
    S.W = await loadWords();
    S.uid = await B.signInKid();
  } catch (e) {
    console.error(e);
    hero('서버에 연결하지 못했어요', '인터넷 연결을 확인하고 새로 고침 해 주세요. 학교 인터넷에서 막혔을 수도 있어요. 선생님께 알려 주세요.');
    return;
  }
  if (S.num) { $('#btnNum').hidden = false; $('#btnNum').textContent = `${S.num}번`; }
  B.onRoom(ROOM, (room) => onRoom(room).catch((e) => console.error(e)), (e) => {
    console.error(e);
    hero('서버에 연결하지 못했어요', '새로 고침 해 주세요. 계속 안 되면 선생님께 알려 주세요.');
  });
  if (!load('seenHelp', false)) { save('seenHelp', true); help(); }
}

window.__kk = S; // 시험 도구용
start();
