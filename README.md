# 우리반 꼬맨틀

날마다 비밀 낱말 하나. 아무 낱말이나 쓰면 비밀 낱말과 뜻이 얼마나 가까운지 점수가 나오고, 점수를 따라가며 맞히는 교실 게임입니다.
서버 없이 미리 계산한 점수 파일로 돕니다(GitHub Pages).

- 시험: `node tools/cdp.mjs tools/play-test.mjs` (이 PC는 앞에 `SOFTGL=1`)
- 글꼴 다시 만들기: `python tools/subset-fonts.py <원본 TTF 폴더>`
- 배포할 때마다 `index.html`의 `?v=` 숫자와 `app.js`의 `VER`를 올린다.

자료 출처와 라이선스는 [CREDITS.md](CREDITS.md).
