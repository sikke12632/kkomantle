// 반 판 서버 연결. 진짜는 Firebase Firestore(프로젝트 mathgame2-d835d),
// 주소에 ?mock 을 붙이면 이 브라우저 안에서만 도는 가짜 서버(시험용, 탭끼리 공유)를 쓴다.
//
// Firestore 모양 (규칙: 작업 저장소 firestore.rules)
//   kk_rooms/{판}                state('open'|'solved'|'closed'), code, openedAt, top[{w,r}], topAt, revealEvery,
//                                answer, solvedNum, solvedUid, solvedAt, message{text,at,removed?}
//   kk_rooms/{판}/players/{uid}  num(출석 번호), best[{w,r}] 가장 가까운 낱말 5개, count, at
//   (맞힌 아이의 한마디는 판 문서의 message 에 바로 쓴다. 금지어는 아이 화면과 규칙이 막는다)

const CONFIG = {
  apiKey: 'AIzaSyCrsEzDt0fzQl-FIP2wB5cfQP2P7-Q2MgY',
  authDomain: 'mathgame2-d835d.firebaseapp.com',
  projectId: 'mathgame2-d835d',
  storageBucket: 'mathgame2-d835d.firebasestorage.app',
  messagingSenderId: '289022898801',
  appId: '1:289022898801:web:332285783342b218cc21d0',
};
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const TEACHER_EMAIL = 'deokinec@gmail.com';

async function firebaseBackend() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
  const app = initializeApp(CONFIG);
  const auth = A.getAuth(app);
  // 학교 인터넷이 실시간 연결을 막아도 되도록 긴 폴링을 스스로 고르게 한다
  const db = F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  const room = (id) => F.doc(db, 'kk_rooms', id);
  const sub = (id, name) => F.collection(db, 'kk_rooms', id, name);
  const rows = (s) => s.docs.map((d) => ({ uid: d.id, ...d.data() }));
  return {
    mock: false,
    // 이미 들어와 있으면(선생님이 같은 브라우저로 아이 화면을 볼 때 등) 그 접속을 그대로 쓴다
    async signInKid() { await auth.authStateReady(); return auth.currentUser ? auth.currentUser.uid : (await A.signInAnonymously(auth)).user.uid; },
    async signInTeacher() { return (await A.signInWithPopup(auth, new A.GoogleAuthProvider())).user.email; },
    onAuth(cb) { return A.onAuthStateChanged(auth, (u) => cb(u && !u.isAnonymous ? u.email : null)); },
    signOut() { return A.signOut(auth); },
    // _pending: 이 기기가 보낸 것이 아직 서버에서 확인되지 않은 상태(서버가 거절하면 되돌아간다)
    onRoom(id, cb, onErr) { return F.onSnapshot(room(id), (s) => cb(s.exists() ? { ...s.data(), _pending: s.metadata.hasPendingWrites } : null), onErr); },
    setRoom(id, data) { return F.setDoc(room(id), data); },
    updateRoom(id, patch) { return F.updateDoc(room(id), patch); },
    setPlayer(id, uid, data) { return F.setDoc(F.doc(sub(id, 'players'), uid), data); },
    onPlayers(id, cb, onErr) { return F.onSnapshot(sub(id, 'players'), (s) => cb(rows(s)), onErr); },
    setNote(id, uid, data) { return F.setDoc(F.doc(sub(id, 'notes'), uid), data); },
    onNotes(id, cb, onErr) { return F.onSnapshot(sub(id, 'notes'), (s) => cb(rows(s)), onErr); },
    deleteNote(id, uid) { return F.deleteDoc(F.doc(sub(id, 'notes'), uid)); },
    async clearRoom(id) {
      for (const name of ['players', 'notes']) {
        const s = await F.getDocs(sub(id, name));
        await Promise.all(s.docs.map((d) => F.deleteDoc(d.ref)));
      }
    },
  };
}

// 가짜 서버: localStorage 에 두고, 다른 탭의 바뀜은 storage 이벤트로 받는다
function mockBackend() {
  const K = 'kkmock:';
  const subs = new Set();
  const get = (p) => JSON.parse(localStorage.getItem(K + p) || 'null');
  const fire = () => subs.forEach((f) => f());
  const put = (p, v) => { if (v == null) localStorage.removeItem(K + p); else localStorage.setItem(K + p, JSON.stringify(v)); fire(); };
  const list = (pre) => Object.keys(localStorage).filter((k) => k.startsWith(K + pre))
    .map((k) => ({ uid: k.slice((K + pre).length), ...JSON.parse(localStorage.getItem(k)) }));
  addEventListener('storage', (e) => { if (!e.key || e.key.startsWith(K)) fire(); });
  const watch = (fn) => { const f = () => fn(); subs.add(f); setTimeout(f); return () => subs.delete(f); };
  let uid = sessionStorage.getItem('kkmock-uid');
  if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('kkmock-uid', uid); }
  return {
    mock: true,
    async signInKid() { return uid; },
    async signInTeacher() { sessionStorage.setItem('kkmock-teacher', '1'); return TEACHER_EMAIL; },
    onAuth(cb) { setTimeout(() => cb(sessionStorage.getItem('kkmock-teacher') ? TEACHER_EMAIL : null)); return () => {}; },
    async signOut() {},
    onRoom: (id, cb) => watch(() => cb(get('rooms/' + id))),
    async setRoom(id, d) { put('rooms/' + id, d); },
    async updateRoom(id, p) {
      const cur = get('rooms/' + id);
      if (!cur) throw new Error('not-found');
      // 진짜 규칙처럼: 아이의 '맞힘'은 아직 열린 판에서 한 번만
      if (p.solvedUid && p.solvedUid !== 'teacher' && cur.state !== 'open') throw new Error('permission-denied');
      put('rooms/' + id, { ...cur, ...p });
    },
    async setPlayer(id, u, d) { if (get('rooms/' + id)?.state !== 'open') throw new Error('permission-denied'); put(`players/${id}/${u}`, d); },
    onPlayers: (id, cb) => watch(() => cb(list(`players/${id}/`))),
    async setNote(id, u, d) { put(`notes/${id}/${u}`, d); },
    onNotes: (id, cb) => watch(() => cb(list(`notes/${id}/`))),
    async deleteNote(id, u) { put(`notes/${id}/${u}`, null); },
    async clearRoom(id) { for (const pre of [`players/${id}/`, `notes/${id}/`]) list(pre).forEach((r) => localStorage.removeItem(K + pre + r.uid)); fire(); },
  };
}

export const B = new URLSearchParams(location.search).has('mock') ? mockBackend() : await firebaseBackend();
