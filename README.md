# 우리반 꼬맨틀

선생님이 판을 열면 반 전체가 같은 비밀 낱말을 함께 찾는 교실 게임입니다. 아무 낱말이나 쓰면 비밀 낱말과 뜻이 얼마나 가까운지 점수가 나오고, 한 명이 맞히면 판이 끝나고 맞힌 아이의 따뜻한 한마디가 모두의 화면에 뜹니다.
점수는 미리 계산한 파일(GitHub Pages)로 각자 기기에서 내고, 서버는 판 상태·반이 찾은 낱말·한마디만 주고받습니다.

- 시험: `node tools/cdp.mjs tools/class-test.mjs` (가짜 서버로 선생님 탭 + 아이 탭 둘. 이 PC는 앞에 `SOFTGL=1`)
- 반 판 서버: Firebase Firestore(프로젝트 mathgame2-d835d). 주소에 `?mock`을 붙이면 브라우저 안 가짜 서버로 돈다.
- 선생님 화면: `teacher.html` (선생님 구글 계정으로만 판을 열고 닫는다)
- 글꼴 다시 만들기: `python tools/subset-fonts.py <원본 TTF 폴더>`
- 배포할 때마다 `index.html`·`teacher.html`의 `?v=` 숫자와 `common.js`의 `VER`를 올린다.

자료 출처와 라이선스는 [CREDITS.md](CREDITS.md).
