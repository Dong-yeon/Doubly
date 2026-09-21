# 앱 아이콘 방향 전환 — 개구리를 내린다 (2026-09-21)

> **상태: 방향 결정만. 에셋·코드 변경 없음.** 저장소의 아이콘 5종은 아직 §10 시점
> (까꿍 컷 + 떠 있는 왕관·하트) 그대로입니다.
> 선행 문서: [APP_ICON_BIGAE_REVIEW_2026-09-10.md](APP_ICON_BIGAE_REVIEW_2026-09-10.md)
> (§1~§10 — 진단과 세 라운드의 교정 이력). 겹치는 내용은 옮기지 않고 **그 문서가 틀렸거나
> 낡은 것, 그리고 이번에 새로 정한 것만** 적습니다.

## 0. 결론

- **개구리를 내린다.** 세 번째로 같은 반응("너무 장난 같다")이 나왔고, 원인이 교정으로
  닫히지 않는다는 것이 확인됐다.
- **배경은 흰색 유지.** §7 의 버건디는 되살리지 않는다.
- **캐릭터는 계란 방향**(더비·블리를 "계란"으로 정의). 다만 아이콘 조형과 캐릭터 정의는
  **분리해서** 진행한다 — §5.
- **최종 마크는 미확정.** 후보와 판정은 §6.
- 그리고 이 문서에서 가장 중요한 것: **아이콘이 앱에 존재하지 않는 캐릭터를 쓰고 있다**(§3).

## 1. 선행 문서가 낡았다 — 근거 두 개가 무효다

§4·§8 이 "교체가 아니라 교정"을 택한 핵심 근거는 **스티커와의 IP 정합성 비용**이었다.

> §4: 스티커 20종(`bigae_*` 10종, `bear_*` 9종)과 IP 가 실제로 연결돼 있습니다. (…)
> 교체가 아니라 교정으로 가야 할 근거입니다.
>
> §8: 아이콘만 바꾸면 **앱을 열었을 때 다른 캐릭터가 나옵니다.**

**그 자산은 지금 없다.**

| §4 가 적은 것 | 2026-09-21 실제 |
| --- | --- |
| `bigae_*` 10종 | **0장.** `frontend/assets/stickers/` 에 파일 없음 |
| `bear_*` 9종 | 9장 있으나 **오늘 피커에서 내려감** |
| — | `dubi_*` 14 · `bli_*` 14 가 그 자리를 대신했고, **이것도 오늘 내려감** |

`stickerImages.ts` 의 캐릭터 구획은 더비·블리·곰돌이 셋이고 `StickerImage.java` 에
`BIGAE_` 코드는 **하나도 없다**. 그리고 오늘
([STICKER_PACK_MONETIZATION_2026-09-21.md](STICKER_PACK_MONETIZATION_2026-09-21.md) §4)
더비 14 · 블리 14 · 곰돌이 10 이 전부 `RETIRED_STICKER_IMAGES` 로 옮겨져 **피커에는 한 장도
남아 있지 않다**(지난 말풍선만 그려진다).

**그래서 판단이 뒤집힌다.** §8 이 기하 재작도를 폐기한 이유("스티커 20종과 조형 언어가
갈라진다")는 지금 성립하지 않는다 — **갈라질 상대가 화면에 없다.** 캐릭터를 다시 정하는
비용이 지금 가장 낮고, 오늘 이후로는 다시 올라간다(새 캐릭터 스티커가 붙는 순간).

> 부수 정정: §10 이 "패스 12개(몸통·볼2·혀·입·눈2·왕관·하트4)"라고 적었는데 실제
> `bigae-mark.svg` 는 **패스 14개**다. 목록에서 **눈썹 2개**(인덱스 6·7, `A` 커맨드
> 아크, `stroke-width` 1.37)가 빠졌다.

## 2. 왜 세 라운드가 실패했나

§9(까꿍 컷 교체)와 §10(왕관 분리)은 각각 측정 근거가 있었고 그 측정 자체는 옳았다.
그런데 같은 반응이 또 나왔다. 현행 `icon.png` 를 실물로 보고 다시 가른 원인은 다섯이다.

| 장난 신호 | 현행 | 선행 문서의 처리 |
| --- | --- | --- |
| **혀 내민 메롱 표정** | 있음 | **항목조차 없음** — 까꿍 컷으로 바꾸며 따라 들어왔다 |
| 볼터치 홍조 | 있음 | §10 "의도적 유지" |
| **왕관·하트가 본체에서 떨어져 떠 있음** | 있음 | §10 에서 일부러 띄움 |
| 종 판독 실패(눈이 윤곽 안) | 그대로 | §5-2 **3라운드 연속 미해결** |
| 흰 배경 + 여백 | 흰색 | §9 에서 버건디 → 흰색 회귀 |

1번이 누락된 것이 결정적이다. **메롱은 "장난"의 직접 코드**인데, §9 가 컷을 고를 때
평가축이 "잉크 질량"이었기 때문에 표정의 의미가 검토 대상에 들어가지 않았다.

3번도 같은 종류의 함정이다. §10 은 "판독성을 조금 내주고 서사를 얻는 교환"이라고 적었는데,
아이콘은 **그리드 안의 하나짜리 물체**라 요소가 흩어지면 서사가 아니라 낙서로 읽힌다.
커밋 `2426ea7` 이 팔·다리·모션선을 뺀 이유가 정확히 그것이었고, 떠 있는 왕관·하트는
같은 성질이다 — §10 이 그 표를 스스로 적어놓고도 반대로 결론냈다.

**§8 의 결론이 맞았다**: "캐릭터라서 유치한 게 아니라 **정제되지 않아서**"다. 그러면
컷 교체(§9)와 요소 재배치(§10)로는 닫히지 않는다. 둘 다 정제가 아니라 구성 변경이었다.

## 3. 결정적 발견 — 아이콘이 없는 캐릭터를 쓰고 있다

```
frontend/assets/icon.png              비개구리
frontend/assets/bigae-mark.svg        비개구리 (마스터)
frontend/src/components/BigaeMark.tsx 비개구리 — 화면 사용처 0건 (정의만 존재)
frontend/assets/stickers/bigae_*      없음
backend/.../chat/domain/StickerImage  BIGAE_ 코드 0건
```

**앱을 열면 아이콘의 캐릭터가 안에 없다.** §9 가 "`BigaeMark` 는 아직 화면 어디에서도
쓰이지 않아 이 교체로 인한 화면 회귀는 없습니다"라고 적은 그 상태가, 스티커까지 사라지면서
**끊어진 채로 굳었다.**

"장난 같다"와 별개로 이것 자체가 결함이다. 아이콘을 어느 방향으로 바꾸든 이 연결은
복구해야 한다.

## 4. 확정한 것

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 개구리(비개구리) | **내린다** | §1·§2. 종 판독이 3라운드 미해결이고, 지킬 IP 가 이미 없다 |
| 배경 | **흰색 유지** | `app.json` `adaptiveIcon.backgroundColor` `#FFFFFF` 그대로. §7 버건디 되살리지 않음 |
| 혀·볼터치 | **뺀다** | 장난 신호 중 가장 직접적 |
| 떠 있는 왕관·하트 | **뺀다** | §2 3번 |

**흰 배경을 유지하면 제약이 하나 따라온다.** §9 가 실측한 대로, 흰 배경에서 형태가
버티는 것은 채도가 아니라 **잉크 질량**이다. 따라서 새 마크는 **채운 형태**여야 하고,
얇은 아웃라인은 쓸 수 없다 — 옛 `doubly-logo.svg`(두 하트 **아웃라인** + 그라데이션)로
되돌리면 커밋 `2426ea7` 이 지적한 "48px 에서 실루엣 없음"이 그대로 재발한다.

## 5. 캐릭터 — 계란으로 정의한다

"계란으로 **바꾸자**"가 아니라 "지금 형태를 계란으로 **정의하자**"가 정확하다.
`dubi_excited.png` / `bli_love.png` 는 이미 **팔다리 없는 둥근 덩어리 + 정수리 하트 홈**
이다. 새로 그리는 게 아니라 이름과 규칙을 주는 것이다.

| 근거 | |
| --- | --- |
| 조형 비용 | 이미 그 형태다. 재작도가 아니라 정의 |
| **"둘"이 구조에 내장** | 쌍란 = 노른자 2개. `colors.ts` 의 `나 = Gold #8A6817` / `상대 = Green #2C7D33` 이 **블리 노랑 / 더비 초록**과 이미 짝이 맞는다 |
| 앱 내용과 연결 | 주력이 식단 OCR·맛집(럽슐랭)이다. 계란은 음식 신호를 준다. 개구리는 앱 내용과 무관했고, §1 의 "설명이 필요한 아이콘은 실패한 아이콘"이 그 뜻이다 |
| 종 판독이 공짜 | 타원은 설명이 필요 없다. §5-2 가 닫힌다 |
| 성장 서사 | [CHARACTER_EVOLUTION_DESIGN.md](CHARACTER_EVOLUTION_DESIGN.md) 의 크기 축이 **"알 → 새싹 → …"** 로 시작한다. 육성은 보류(`V56__drop_couple_characters.sql`)지만 되살릴 때 처음부터 맞는다 |

### 주의 셋

1. **흰 껍질로 그리면 안 된다.** §7 측정에서 크림 `#F6EFDF` 는 L\* 94.6 / ΔL\* 14.3 으로
   **현행 흰 배경보다 나빴다.** 흰 배경을 유지하기로 한 이상 껍질은 더비 초록 / 블리 노랑
   이어야 한다.
2. **구데타마 리스크.** 계란 캐릭터에서 가장 유명한 것이 장난스러움의 대명사다.
   표정을 정제하지 않으면 종만 바뀌고 반응은 같다.
3. **종 교체는 이 문제의 해법이 아니다**(§2). 계란으로 바꿔도 손그림 떨림 + 볼터치 + 혀
   문법을 그대로 쓰면 같은 소리를 듣는다. **그래서 캐릭터 정의와 아이콘 조형을 분리한다.**

## 6. 탐색한 후보와 판정

전부 렌더해 96 / 48 / 24px 축소본과 앱 서랍 시뮬레이션(카톡·인스타·당근·네이버 근사색
옆 배치, 밝은 홈 / 다크 홈)으로 비교했다. 재현 코드는 §9.

| 계열 | 안 | 판정 |
| --- | --- | --- |
| 정돈 | **B/C** 혀·볼터치·떠있는 요소 제거, 왕관을 머리에 얹고 입을 가로 다문 미소 | 현행 대비 큰 개선. 단 종 판독은 그대로 미해결 |
| 개구리 | **D1/D3** 위에 §5-2 적용(윤곽 위로 솟은 눈 + 가로 입) | 개구리로 즉시 읽힘. **개구리를 내리기로 해 폐기** |
| 개구리 | D2 = D3 + 왕관 | **폐기.** 왕관이 눈두덩 사이에 끼어 뭉갠다 |
| 하트+개구리 | **M2** 하트를 머리로, 하트 두 엽 위에 돌출 눈. `heartPoints` 곡선에 저주파 손떨림(진폭 0.55) | 이 계열 최선. **개구리를 내리기로 해 폐기** |
| 하트+개구리 | M1(떨림 없음) / M3(넓은 하트) | M1 은 듀오링고 쪽, M3 는 하트보다 개구리로 먼저 읽힘 |
| 추상 | **Q5** 하트 하나를 2색(Gold/Green)으로 가르되 **이음매를 S자로** | **현 시점 최선.** 24px 까지 형태 유지 |
| 추상 | Q1 직선 이음매 | **깨진 하트로 읽힐 위험.** 커플 앱에서 치명적이라 뺀다 |
| 추상 | P1/P3/N1 두 하트 겹침(겹친 자리 Olive) | 의미는 좋으나 24px 에서 덩어리로 뭉갠다 |
| 추상 | N3 DD 모노그램 | **폐기.** 캡슐·알약으로 읽힌다 |

**Q5 는 "커플 앱 중앙값(하트)"이 아니다.** `2426ea7` 이 하트를 내린 이유는 그것이
**아웃라인 + 그라데이션**이어서였지 하트여서가 아니다(§4 마지막 문단). 채운 2색 하트는
그 문제가 없고, Gold/Green 듀오톤은 핑크 중앙값에서 벗어나 있으며, `colors.ts` 의
`나 / 상대` 의미축을 그대로 그림으로 만든다. 곡선은 `DoublyLogo.tsx` 의 `heartPoints`
그대로라 인앱 심볼과 같은 하트를 쓴다.

### 6-1. 24px 잉크 비율 — 그리고 이 지표를 그대로 믿으면 안 되는 이유

§9(선행 문서)의 "24px 진한 픽셀 비율"을 같은 식으로 다시 쟀다(평균 밝기 < 110 을 진한
픽셀로 센다). §10 부터 이어진 기준선이다.

| | 24px 진한 픽셀 |
| --- | --- |
| 현행 `icon.png` | **8.5%** |
| B 정돈 | 11.6% |
| D3 개구리 | 8.5% |
| M2 하트+개구리 | 9.0% |
| Q5 갈라진 하트 | **18.1%** ← 아래 주의 |

**Q5 의 18.1% 는 다른 값들과 같은 의미가 아니다.** 이 지표는 *파스텔 몸통 위의 검은
윤곽선*을 세려고 만든 것인데, Q5 는 윤곽선이 없는 채움 마크이고 초록 `#4E9E56` 의 평균
밝기가 107 이라 **면 전체가 "진한 픽셀"로 잡힌다.** 즉 Q5 는 잉크가 많은 게 아니라
지표가 색면을 잉크로 오인한 것이다.

채움 마크의 올바른 지표는 잉크 비율이 아니라 **배경 대비 ΔL\*** 와 **마크 점유율**이다
(§7 이 쓴 축). 그건 아직 재지 않았다 — 채택안이 정해지면 그 축으로 다시 재야 한다.

나머지 판정(형태가 24px 에서 읽히는가, 깨진 하트로 보이는가, 눈이 4개로 뭉치는가)은
**육안이다.**

## 7. 인앱 로고와의 관계 (미정)

`DoublyMark` 는 **겹친 두 하트 아웃라인 + 반짝임 3개**이고 스플래시·로그인·에러화면·홈
히어로 4곳에서 쓰인다. Q5 를 채택하면 아이콘과 인앱 로고가 서로 다른 하트가 된다.

§2(선행 문서)가 정리한 카카오 구조(아이콘 = 추상 심볼, 인앱 = 캐릭터)와는 어긋나지 않지만,
**아이콘도 추상 심볼이고 인앱도 추상 심볼인데 둘이 다른 하트**인 상태는 설명이 안 된다.
통일 여부를 정해야 한다.

## 8. 미결

| 항목 | 상태 |
| --- | --- |
| 최종 마크 채택 (Q5 / 정돈안 / 계란 두 알) | **미정** |
| 계란 두 알 구도 | 미탐색. §8(선행)이 실측한 함정 있음 — **48px 에서 눈 4개가 일렬로 붙어 "눈 넷 달린 한 마리"로 읽힌다.** 해법(마주 보는 옆모습으로 눈을 2개로)을 계란에 적용해봐야 함 |
| 채택안의 실측 ΔL\* · 마크 점유율 | **미실시.** 24px 잉크 비율은 §6-1 에서 쟀으나 채움 마크에는 그 지표가 안 맞는다 |
| `BigaeMark.tsx` · `bigae-mark.svg` 처리 | 미정. 개구리를 내리면 삭제 대상 |
| 더비·블리 되살리기 | 미정. `RETIRED_STICKER_IMAGES` 에 28종이 그대로 있고 **출처가 깨끗하다**. `STICKER_CHARACTERS` 에 두 줄이면 복귀 |
| 실기기 홈 화면 육안 확인 | **미검증** — 선행 문서 §9·§10 부터 이어진 항목 |
| Play Console 스토어 아이콘(512²) | 미착수 — 선행 문서 §6 부터 이어진 항목 |

## 9. 다른 작업과의 연결

**스티커 상점의 매대가 이 결정에 걸려 있다.**
[STICKER_PACK_MONETIZATION_2026-09-21.md](STICKER_PACK_MONETIZATION_2026-09-21.md) §13-1 이
"상점에 팔 물건이 이것뿐" 이라고 적은 그 **캐릭터 스티커**가, 오늘 전부 내려간 더비·블리다.
캐릭터를 확정하고 스티커를 다시 그리면 그게 그대로 상품이 된다. 아이콘 · 캐릭터 · 상점
매대가 **같은 병목**이다.

> 해상도 주의(그 문서 §13-1): 기존 스티커는 360×360 이고 말풍선이 132pt 로 그리므로
> 3배 밀도에서 396px 가 필요하다. 시트(1024px)에서 잘라내면 칸당 160px 라 흐려진다.

## 10. 후보 재현

저장소에 에셋으로 넣지 않는다 — 채택안이 없고, `docs/` 는 md 전용 관례를 유지한다
(선행 문서 §8 과 같은 방침). 아래 하나로 §6 의 후보가 전부 나온다.

```bash
pip install pillow cairosvg
python3 - <<'PY'
import re, math, io
import cairosvg
from PIL import Image

SRC = 'frontend/assets/bigae-mark.svg'
GREEN, INK = '#AAD2A0', '#2B2B2B'
GOLD, GREEN2 = '#C9A227', '#4E9E56'          # colors.ts 의 나/상대 계열 밝은 톤

raw = open(SRC, encoding='utf-8').read()
P = [dict(re.findall(r'([\w-]+)="([^"]*)"', t)) for t in re.findall(r'<path[^>]*>', raw)]
# 0 몸통 / 1 혀 / 2,3 볼 / 4,5 눈 / 6,7 눈썹 / 8 입 / 9 왕관 / 10,11 하트L / 12,13 하트R

def xf(d, s=1.0, dx=0.0, dy=0.0, ox=50.0, oy=50.0):
    """균등 스케일 + 평행이동. M/L/C 는 좌표쌍, A 는 rx,ry,rot,laf,sf,x,y."""
    out, i = [], 0
    tok = re.findall(r'[MLCZA]|-?\d*\.?\d+', d)
    while i < len(tok):
        t = tok[i]
        if t in 'MLC':
            out.append(t); i += 1
            n = {'M': 2, 'L': 2, 'C': 6}[t]
            while i < len(tok) and re.fullmatch(r'-?\d*\.?\d+', tok[i]):
                pts = []
                for _ in range(0, n, 2):
                    x, y = float(tok[i]), float(tok[i + 1]); i += 2
                    pts.append(f'{ox+(x-ox)*s+dx:.3f},{oy+(y-oy)*s+dy:.3f}')
                out.append(' '.join(pts))
        elif t == 'A':
            out.append('A'); i += 1
            rx, ry, rot, laf, sf = float(tok[i]), float(tok[i+1]), tok[i+2], tok[i+3], tok[i+4]
            x, y = float(tok[i+5]), float(tok[i+6]); i += 7
            out.append(f'{rx*s:.3f},{ry*s:.3f} {rot} {laf} {sf} '
                       f'{ox+(x-ox)*s+dx:.3f},{oy+(y-oy)*s+dy:.3f}')
        elif t == 'Z':
            out.append('Z'); i += 1
        else:
            i += 1
    return ' '.join(out)

def tag(i, s=1.0, dx=0.0, dy=0.0):
    a = dict(P[i]); a['d'] = xf(a['d'], s, dx, dy)
    return '<path ' + ' '.join(f'{k}="{v}"' for k, v in a.items()) + '/>'

def svg(body, bg):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" '
            f'height="100"><rect width="100" height="100" fill="{bg}"/>{body}</svg>')

# ── B 정돈: 혀·볼터치·하트 제거, 입을 가로 다문 미소로, 왕관을 머리에 얹는다 ──
def tidy(sc=1.14, dy=2.0):
    y  = 50 + (70.5 - 50) * sc + dy
    x0 = 50 + (28.0 - 50) * sc
    x1 = 50 + (72.0 - 50) * sc
    return (tag(0, sc, 0, dy) + tag(6, sc, 0, dy) + tag(7, sc, 0, dy)
            + tag(4, sc, 0, dy) + tag(5, sc, 0, dy)
            + f'<path d="M{x0:.2f},{y:.2f} Q50,{y+11.5*sc:.2f} {x1:.2f},{y:.2f}" fill="none" '
              f'stroke="{INK}" stroke-width="{3.0*sc:.2f}" stroke-linecap="round"/>'
            + tag(9, sc * 0.78, 0, dy + 17.0 * sc))

# ── D3 개구리: 눈두덩을 몸통 뒤에 깔아 윤곽 위로 솟게 한다(§5-2) ──
def froggy(sc=0.98, dy=8.0, ey=36.5, ex=18.5, er=14.5):
    S = lambda v: 50 + (v - 50) * sc
    bump = ''.join(f'<circle cx="{S(50+d):.2f}" cy="{S(ey)+dy:.2f}" r="{er*sc:.2f}" '
                   f'fill="{GREEN}" stroke="{INK}" stroke-width="{2.49*sc:.2f}"/>'
                   for d in (-ex, ex))
    pup = ''.join(f'<circle cx="{S(50+d):.2f}" cy="{S(ey-1)+dy:.2f}" r="{6.8*sc:.2f}" '
                  f'fill="{INK}"/>' for d in (-ex, ex))
    y = S(66.0) + dy
    return (f'<g>{bump}</g>' + tag(0, sc, 0, dy) + pup
            + f'<path d="M{S(27):.2f},{y:.2f} Q50,{y+13*sc:.2f} {S(73):.2f},{y:.2f}" '
              f'fill="none" stroke="{INK}" stroke-width="{3.1*sc:.2f}" stroke-linecap="round"/>')

# ── 하트 곡선 — DoublyLogo.tsx 의 heartPoints 와 같은 식 ──
def heart(sc, sx=1.0, tipk=1.0, seed=None, amp=0.0, seg=360):
    import random
    w = [0.0] * (seg + 1)
    if seed is not None:                       # 저주파 손떨림 — 위상 다른 사인 3개
        rnd = random.Random(seed)
        ph = [rnd.uniform(0, 2 * math.pi) for _ in range(3)]
        w = [sum(math.sin(k * 2 * math.pi * i / seg + ph[j])
                 for j, k in enumerate((3, 5, 8))) / 3 * amp for i in range(seg + 1)]
    p = []
    for i in range(seg + 1):
        t = 2 * math.pi * i / seg
        x = 16 * math.sin(t) ** 3 * sc * sx
        y = -(13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t)) * sc
        if y > 0: y *= tipk
        r = math.hypot(x, y) or 1
        p.append((x + x / r * w[i], y + y / r * w[i]))
    return p

def fit(paths, pad=0.90):
    xs = [x for p in paths for x, _ in p]; ys = [y for p in paths for _, y in p]
    s = pad * 100 / max(max(xs) - min(xs), max(ys) - min(ys))
    ox = 50 - (min(xs) + max(xs)) / 2 * s; oy = 50 - (min(ys) + max(ys)) / 2 * s
    return [[(x * s + ox, y * s + oy) for x, y in p] for p in paths], s

def dstr(p):
    return 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in p) + ' Z'

# ── M2 하트+개구리: 하트가 머리, 두 엽 위에 돌출 눈 ──
def heart_frog(sc=2.45, sx=1.22, tipk=0.86, er=13.2, pr=6.9, rise=0.70, mouth_t=0.60):
    pts = heart(sc, sx, tipk, seed=7, amp=0.55)
    L = min([q for q in pts if q[0] < 0], key=lambda q: q[1])
    R = min([q for q in pts if q[0] > 0], key=lambda q: q[1])
    ec = [(L[0], L[1] - er * rise), (R[0], R[1] - er * rise)]
    eye_pts = [[(x + dx, y + dy) for x, y in ((-er, -er), (er, er))] for dx, dy in ec]
    (P0, *_), s = fit([pts] + eye_pts, 0.90)
    (_, *E), _ = fit([pts] + eye_pts, 0.90)
    body = f'<path d="{dstr(P0)}" fill="{GREEN}" stroke="{INK}" stroke-width="2.49" stroke-linejoin="round"/>'
    eyes = pups = ''
    for (a, b), sg in zip(E, (-1, 1)):
        cx, cy = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        eyes += (f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{er*s:.2f}" fill="{GREEN}" '
                 f'stroke="{INK}" stroke-width="2.49"/>')
        pups += f'<circle cx="{cx+sg*0.7*s:.2f}" cy="{cy+0.9*s:.2f}" r="{pr*s:.2f}" fill="{INK}"/>'
    ys = [y for _, y in P0]
    ym = min(ys) + (max(ys) - min(ys)) * mouth_t
    row = [x for x, y in P0 if abs(y - ym) < 1.0]
    # 폭은 중심(50)에서 잰 반폭이다 — 절대 x 를 그대로 쓰면 입이 하트 밖으로 나간다
    half = ((max(row) - 50) if row else 10) * 0.58
    return (eyes + body + pups
            + f'<path d="M{50-half:.2f},{ym:.2f} Q50,{ym+11*s:.2f} {50+half:.2f},{ym:.2f}" '
              f'fill="none" stroke="{INK}" stroke-width="3.1" stroke-linecap="round"/>')

# ── Q5 갈라진 하트: 왼 Gold(나) · 오른 Green(상대), 이음매는 S자 ──
def split_heart(gap=4.2, pad=0.94):
    (P0,), _ = fit([heart(2.85)], pad)
    cur = 'M50,-15 C61,20 39,58 50,115'
    return (f'<defs><clipPath id="hc"><path d="{dstr(P0)}"/></clipPath></defs>'
            f'<g clip-path="url(#hc)">'
            f'<rect x="-5" y="-5" width="110" height="110" fill="{GOLD}"/>'
            f'<path d="{cur} L130,115 L130,-15 Z" fill="{GREEN2}"/>'
            f'<path d="{cur}" fill="none" stroke="#FFFFFF" stroke-width="{gap}"/></g>')

for name, body in (('B_tidy', tidy()), ('D3_frog', froggy()),
                   ('M2_heartfrog', heart_frog()), ('Q5_split', split_heart())):
    s = svg(body, '#FFFFFF')
    png = cairosvg.svg2png(bytestring=s.encode(), output_width=1024, output_height=1024,
                           background_color='#FFFFFF')
    im = Image.open(io.BytesIO(png)).convert('RGB')
    im.save(f'/tmp/{name}.png')
    # 24px 진한 윤곽 비율 — §9(선행 문서)의 잉크 질량 지표와 같은 계산
    s24 = im.resize((24, 24), Image.LANCZOS)
    px = list(s24.get_flattened_data())
    dark = sum(1 for p in px if sum(p) / 3 < 110)
    print(f'{name:14s} 24px 진한 픽셀 {100*dark/len(px):5.1f}%')
PY
```

앱 서랍 시뮬레이션은 위 PNG 를 스퀘어클 마스크로 자르고 카톡 노랑 `#FAE100` ·
인스타 핑크 `#E1306C` · 당근 주황 `#FF6F0F` · 네이버 초록 `#03C75A` 근사 타일 옆에
밝은 홈(`#EDEDED`) / 다크 홈(`#141414`) 두 벌로 배치해 봤다.
