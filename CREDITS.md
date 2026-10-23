# 우리반 꼬맨틀 — 만든 사람들과 자료

우리 반 아이들을 위해 담임 선생님과 Claude(Anthropic)가 함께 만든 교실 게임입니다.
게임 방식은 「Semantle」과 「꼬맨틀」에서 아이디어를 얻었고, 코드는 새로 썼습니다.

## 자료

| 자료 | 쓰는 곳 | 라이선스 |
|---|---|---|
| fastText 한국어 낱말 벡터 `cc.ko.300` (Facebook AI Research) — https://fasttext.cc/docs/en/crawl-vectors.html | 낱말끼리 뜻이 얼마나 가까운지 점수 계산 | CC BY-SA 3.0 |
| 한국어기초사전 (국립국어원) — https://krdict.korean.go.kr | 낱말 목록, 학습 등급, 정답 뜻풀이 | CC BY-SA 2.0 KR |
| hunspell-dict-ko — https://github.com/spellcheck-ko/hunspell-dict-ko | 위 사전 자료를 모은 표준어 낱말 목록 | CC BY-SA 4.0 (낱말 자료) |
| 송명 Song Myung, 고운돋움 Gowun Dodum | 글꼴 | SIL OFL 1.1 (`fonts/*-OFL.txt`) |

`data/` 폴더의 낱말 목록과 점수 파일은 위 자료에서 만든 것이라 **CC BY-SA**를 따릅니다.

T. Mikolov, E. Grave, P. Bojanowski, C. Puhrsch, A. Joulin, *Learning Word Vectors for 157 Languages* (2018).
