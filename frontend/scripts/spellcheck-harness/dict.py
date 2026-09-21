#!/usr/bin/env python3
"""2층(Hunspell) 오프라인 하네스 — 2026-09-20 감사 도구(docs/SPELLCHECK_AUDIT_2026-09-20.md).
필요: 시스템 hunspell CLI(`apt-get install hunspell`, 1.7.2 — 번들 소스와 동일 버전).
 — 앱이 쓰는 ko.aff/ko.dic 을 **진짜 Hunspell**(CLI 1.7.2, ispell -a 파이프 모드)로 돌린다.

앱 네이티브 모듈(modules/korean-spell/cpp/KoreanSpellCore.cpp:64)도 vanilla Hunspell 의 suggest() 를 그대로 부르므로
여기 결과는 실기기와 같은 알고리즘이다(번들 버전이 1.7.x 로 조금 다를 수 있음 — 후보 순서·개수가 미세하게 다를 여지).
이전 버전(spylls)은 이 ko.aff(ICONV 로 음절→자모 분해 후 처리)에서 suggest 가 항상 빈 배열이었다 — 폐기.

사용:
  python3 dict.py spell 어절1 어절2 ...        → [{word, known}]
  echo '["어절",...]' | python3 dict.py spell-json
  python3 dict.py suggest 어절1 어절2 ...      → [{word, known, candidates, source}]
  echo '["어절",...]' | python3 dict.py suggest-json
사전 로딩 ~1초. 어절은 공백이 없어야 한다(앱의 collectTokens 도 그렇다).
"""
import json, subprocess, sys

import os
PREFIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'modules', 'korean-spell', 'dict', 'ko')

def run(words):
    # ispell -a: 줄마다 결과 → '*' 맞음, '+ 어근' 맞음(접사), '-' 맞음(복합), '& 원어 개수 위치: 후보,...', '# 원어 위치' 후보 없음
    # 줄 앞 '^' 는 "이 줄을 검사해라, ^ 는 무시" — 특수문자 명령으로 오해되지 않게 한다
    inp = ''.join('^' + w + '\n' for w in words)
    p = subprocess.run(['hunspell', '-a', '-i', 'utf-8', '-d', PREFIX], input=inp.encode('utf-8'),
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    lines = p.stdout.decode('utf-8', 'replace').split('\n')
    # 첫 줄은 버전 배너. 이후 어절마다 결과 1줄 + 빈 줄 1개
    body = [l for l in lines[1:] if l != '']
    out = []
    for w, line in zip(words, body):
        if line.startswith('*') or line.startswith('+') or line.startswith('-'):
            out.append({'word': w, 'known': True, 'candidates': [], 'source': 'hunspell-1.7.2'})
        elif line.startswith('&'):
            cands = line.split(':', 1)[1].strip()
            out.append({'word': w, 'known': False,
                        'candidates': [c.strip() for c in cands.split(',') if c.strip()], 'source': 'hunspell-1.7.2'})
        elif line.startswith('#'):
            out.append({'word': w, 'known': False, 'candidates': [], 'source': 'hunspell-1.7.2'})
        else:
            out.append({'word': w, 'known': None, 'candidates': [], 'source': 'parse-error:' + line[:40]})
    if len(out) != len(words):
        sys.stderr.write(f'경고: 입력 {len(words)}개인데 결과 {len(out)}개 — 어절에 공백/제어문자가 섞였는지 확인\n')
    return out

cmd, *rest = sys.argv[1:]
if cmd == 'spell':
    print(json.dumps([{'word': r['word'], 'known': r['known']} for r in run(rest)], ensure_ascii=False))
elif cmd == 'spell-json':
    print(json.dumps([{'word': r['word'], 'known': r['known']} for r in run(json.load(sys.stdin))], ensure_ascii=False))
elif cmd == 'suggest':
    print(json.dumps(run(rest), ensure_ascii=False))
elif cmd == 'suggest-json':
    print(json.dumps(run(json.load(sys.stdin)), ensure_ascii=False))
else:
    sys.exit('unknown cmd')
