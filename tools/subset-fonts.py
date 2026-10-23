"""게임에 쓸 글꼴을 만든다 (조선의 왕 도구를 본떴다).

    python tools/subset-fonts.py <원본 TTF가 있는 폴더>

꼬맨틀은 아이가 아무 낱말이나 치므로, 화면 글자뿐 아니라
자주 쓰는 한글 2,350자(KS X 1001)와 낱말 목록(data/words.json)의 모든 글자를 넣는다.
낱말 목록이나 화면 글을 바꾸면 다시 돌린다.

원본(OFL): Song Myung, Gowun Dodum — github.com/google/fonts/ofl/
필요: pip install fonttools brotli
"""
import glob
import json
import os
import sys

from fontTools import subset

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else '.'

chars = set()
for pat in ['index.html', '*.js', '*.css']:
    for p in glob.glob(os.path.join(HERE, pat)):
        chars |= set(open(p, encoding='utf-8').read())
words = json.load(open(os.path.join(HERE, 'data', 'words.json'), encoding='utf-8'))['words']
chars |= set(''.join(words))
for c in range(0xAC00, 0xD7A4):  # KS X 1001 한글 2,350자
    try:
        if len(chr(c).encode('euc-kr')) == 2:  # 4글자 묶음(자모 조합)으로 바뀌는 글자는 2,350자가 아니다
            chars.add(chr(c))
    except UnicodeEncodeError:
        pass
chars |= set(chr(c) for c in range(0x20, 0x7F))
chars |= set('「」·…—–‘’“”')
text = ''.join(sorted(c for c in chars if c >= ' '))

for name, out in [('songmyung_SongMyung-Regular.ttf', 'SongMyung-sub.woff2'),
                  ('gowundodum_GowunDodum-Regular.ttf', 'GowunDodum-sub.woff2')]:
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    font = subset.load_font(os.path.join(SRC, name), opts)
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(font)
    dst = os.path.join(HERE, 'fonts', out)
    subset.save_font(font, dst, opts)
    print(out, os.path.getsize(dst) // 1024, 'KB', len(text), '글자')
