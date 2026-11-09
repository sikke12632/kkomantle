// 아이 화면(app.js)과 선생님 화면(teacher.js)이 함께 쓰는 것
// data/words.json   칠 수 있는 낱말 + 게임이 먼저 보여 줘도 되는 낱말 표시
// data/schedule.json 날짜 → 문제 코드 (선생님이 판을 열 때 오늘 문제로 쓴다)
// data/p/<코드>.json 문제 하나: 낱말마다 점수, 정답 확인 해시, 뜻풀이

export const VER = 8; // index.html·teacher.html 의 ?v=, app.js·teacher.js 의 import ?v= 와 같이 올린다
export const HOT_RANK = 1000; // 이 순위 안이면 "가까워요" 표시
export const $ = (s) => document.querySelector(s);
// 우리 반 출석 번호: 1~15번, 51~63번 (넉넉하게 3명씩 더). firestore.rules 의 okNum 과 같이 고친다.
export const NUM_GROUPS = [[1, 18], [51, 66]];
export const isNum = (n) => NUM_GROUPS.some(([a, b]) => n >= a && n <= b);

// ---------- 작은 도우미 ----------
export function hash(s) { // make_puzzles.py 의 fnv1a 와 같은 계산
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export function b64bytes(b) { const s = atob(b); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
function unhide(b, code) { const a = b64bytes(b); for (let i = 0; i < a.length; i++) a[i] ^= code.charCodeAt(i % code.length); return new TextDecoder().decode(a); }
// 가짜 서버(?mock)로 시험할 때는 탭마다 다른 아이처럼 따로 저장한다
function px() { return 'kkomantle:v2:' + (location.search.includes('mock') ? (sessionStorage.getItem('kkmock-uid') || '') + ':' : ''); }
export function load(k, d) { try { const v = localStorage.getItem(px() + k); return v ? JSON.parse(v) : d; } catch { return d; } }
export function save(k, v) { try { localStorage.setItem(px() + k, JSON.stringify(v)); } catch {} }
export function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export function fmt(v) { return (v / 100).toFixed(2); }
// 받침에 따라 조사 고르기: josa('바다', '은', '는') → '는'
export function josa(w, a, b) { const c = w.charCodeAt(w.length - 1) - 0xac00; const has = c >= 0 && c < 11172 && c % 28 > 0; return has ? a : b; }
export function ro(w) { const c = w.charCodeAt(w.length - 1) - 0xac00; const jong = c >= 0 && c < 11172 ? c % 28 : 0; return jong === 0 || jong === 8 ? '로' : '으로'; }

// 한국 시간 날짜(YYYY-MM-DD)
export function kstToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
export function dayDiff(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); }
export function korDate(iso) { const [, m, d] = iso.split('-').map(Number); return `${m}월 ${d}일`; }
export function mmss(ms) { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

// 판 이름: 오늘 날짜. 시험할 때만 ?test&room=이름 (가짜 서버는 ?mock&room=이름) 으로 따로 연다.
// ?room= 만 붙은 주소는 무시한다 — 아이들이 연습 판 주소를 복사해 들어가 지난 판을 보는 일이 있었다(2026-10-26).
export function roomId() {
  const q = new URLSearchParams(location.search);
  const r = q.get('room');
  return (q.has('test') || q.has('mock')) && r && /^[\w-]{1,40}$/.test(r) ? r : kstToday();
}

export async function getJSON(url) {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + VER);
  if (!r.ok) throw new Error(url);
  return r.json();
}

// ---------- 낱말과 문제 ----------
export async function loadWords() {
  const w = await getJSON('data/words.json');
  const index = new Map();
  w.words.forEach((x, i) => index.set(x, i));
  return { words: w.words, index, show: b64bytes(w.show) };
}
export function isShown(W, i) { return (W.show[i >> 3] >> (i & 7)) & 1; }

export function codeForDate(sched, iso) {
  const n = dayDiff(sched.start, iso);
  return n < 0 ? sched.days[0] : sched.days[n % sched.days.length];
}

export async function loadPuzzle(code) {
  const data = await getJSON(`data/p/${code}.json`);
  const scores = new Int16Array(b64bytes(data.s).buffer);
  const n = scores.length;
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => scores[b] - scores[a]);
  const rankOf = new Int32Array(n);
  for (let r = 0; r < n; r++) rankOf[order[r]] = r + 1;
  return { code, h: data.h, gloss: unhide(data.g, code), scores, order, rankOf };
}
export function isAnswer(P, w) { return !!w && hash(P.code + w) === P.h; }
export function findAnswer(P, W) { return W.words.find((w) => isAnswer(P, w)) || ''; }

// 비밀 낱말과 가장 가까운, 게임이 보여 줘도 되는 낱말 k개
export function nearest(P, W, k) {
  const out = [];
  for (let r = 0; r < P.order.length && out.length < k; r++) if (isShown(W, P.order[r])) out.push(P.order[r]);
  return out;
}

// ---------- 낱말 다듬기: 띄어쓰기·조사 ----------
const JOSA = ['에서부터', '으로부터', '로부터', '에게서', '한테서', '이라고', '께서', '에서', '에게', '한테', '으로', '이랑', '처럼', '보다', '까지', '부터', '하고', '이나', '이다', '로', '랑', '나', '와', '과', '을', '를', '이', '가', '은', '는', '에', '의', '도', '만', '야', '아'];
export function normalize(raw, W) {
  const w = raw.normalize('NFC').replace(/[\s.,!?~'"`·]+/g, '');
  if (!w) return { w: '', i: -1 };
  if (W.index.has(w)) return { w, i: W.index.get(w) };
  for (const j of JOSA) {
    if (w.length > j.length && w.endsWith(j)) {
      const base = w.slice(0, -j.length);
      if (W.index.has(base)) return { w: base, i: W.index.get(base) };
    }
  }
  return { w, i: -1 };
}

// ---------- 가까움 ----------
export function tier(rank) { return rank <= 10 ? 1 : rank <= 100 ? 2 : rank <= HOT_RANK ? 3 : 4; }
export const SAY = { 1: '아주 뜨거워요!', 2: '뜨거워요!', 3: '따뜻해요', 4: '' };
export function heatOfRank(P, r, score) { // 0~1, 등불 밝기와 막대 길이
  if (r <= HOT_RANK) return 0.5 + 0.5 * (1 - Math.log10(r) / 3);
  const s1000 = P.scores[P.order[HOT_RANK - 1]];
  return Math.max(0.02, Math.min(0.48, 0.48 * score / s1000));
}
export function heatOf(P, i) { return heatOfRank(P, P.rankOf[i], P.scores[i]); }
export function coldSay(P, i) {
  const h = heatOf(P, i);
  return h > 0.36 ? '미지근해요' : h > 0.2 ? '조금 차가워요' : '차가워요';
}
export function heatCell(P, i) {
  const r = P.rankOf[i], t = tier(r), h = heatOf(P, i);
  const tag = t < 4 ? `${r}위` : '1000위 밖';
  return `<div class="heat t${t}"><div class="bar"><i style="width:${(h * 100).toFixed(0)}%"></i></div><span class="tag">${tag}</span></div>`;
}

export function confetti(n = 70) {
  const box = $('#confetti');
  if (!box) return;
  const colors = ['#e4572e', '#f0a23b', '#f0cf86', '#b23b30', '#2f7f6f', '#f6b7c0'];
  let html = '';
  for (let k = 0; k < n; k++) {
    html += `<i style="left:${Math.random() * 100}%;background:${colors[k % colors.length]};--dx:${(Math.random() * 160 - 80).toFixed(0)}px;--rot:${(Math.random() * 720).toFixed(0)}deg;animation-duration:${(2.2 + Math.random() * 2).toFixed(2)}s;animation-delay:${(Math.random() * .6).toFixed(2)}s"></i>`;
  }
  box.innerHTML = html;
  setTimeout(() => { box.innerHTML = ''; }, 5000);
}

// ---------- 판의 시계: 다음 낱말 고르기·반이 찾은 낱말 (선생님 화면과 아이 화면이 똑같이 계산한다) ----------
export const DEFAULTS = { revealEvery: 90, autoNext: 10 };

// 학교에 있을 때만 저절로 연다: 월~금, 한국 시간 7:30~16:30
export function schoolTime(now = Date.now()) {
  const d = new Date(now + 9 * 3600e3);
  const day = d.getUTCDay(), min = d.getUTCHours() * 60 + d.getUTCMinutes();
  return day >= 1 && day <= 5 && min >= 7 * 60 + 30 && min < 16 * 60 + 30;
}

// 오늘 이미 쓴 낱말(판 문서의 used + 지금 낱말). 하루에 여러 판을 해도 같은 낱말이 다시 나오지 않게.
export function usedCodes(room) {
  const u = new Set((room && room.used) || []);
  if (room && room.code) u.add(room.code);
  return u;
}

// 다음 낱말: 오늘 순서표 낱말부터, 그 뒤는 순서표에서 멀리 떨어진 낱말. 오늘 쓴 것은 건너뛴다.
// 주제도 골고루: 오늘 이미 나온 주제(동물·음식·역사…)는 다른 주제를 다 돌 때까지 건너뛴다.
// pick 은 선생님이 「다른 낱말로」를 누른 횟수만큼 더 건너뛴다.
export function nextCode(sched, room, pick = 0) {
  const n = Math.max(0, dayDiff(sched.start, kstToday()));
  const L = sched.days.length, used = usedCodes(room), topics = sched.topics || {};
  const usedTopics = new Set([...used].map((c) => topics[c]).filter(Boolean));
  for (const freshTopic of [true, false]) {
    let skip = pick;
    for (let k = 0; k < L; k++) {
      const c = sched.days[(n + k * 97) % L];
      if (used.has(c) || (freshTopic && k > 0 && usedTopics.has(topics[c]))) continue;
      if (skip-- === 0) return c;
    }
  }
  return sched.days[n % L];
}

// 이번 판(round = 판을 연 시각)에 아이들이 찾은 낱말 가운데 가장 가까운 n개.
// 게임이 보여 줘도 되는 낱말만, 정답은 빼고.
export function topWords(players, P, W, round, n = 3) {
  const best = new Map();
  for (const p of players) {
    if (p.round !== round) continue;
    for (const x of p.best || []) {
      const i = W.index.get(x.w);
      if (i === undefined || !isShown(W, i) || isAnswer(P, x.w)) continue;
      const r = P.rankOf[i];
      if (!best.has(x.w) || best.get(x.w) > r) best.set(x.w, r);
    }
  }
  return [...best].map(([w, r]) => ({ w, r })).sort((a, b) => a.r - b.r).slice(0, n);
}
