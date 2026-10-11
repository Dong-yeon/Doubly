# 맞춤법 검사기 사전층 정량 감사 — 2026-09-20

> 대상: 2층 Hunspell(`frontend/src/utils/koreanDictionary.ts`) + 3층 안전장치(`frontend/src/utils/koreanDictionaryRules.ts`).
> 1층 정규식(`koreanSpellRules.ts`)은 대조군으로만 등장한다.
> 저장소 파일은 수정하지 않았다. 모든 수치는 하네스(스크래치, 저장소 밖) 실측이며, 파일 경로는 저장소 루트 기준이다.
> 제안 저장 위치: `docs/SPELLCHECK_DICTIONARY_LAYER_AUDIT_2026-09-20.md`

## 0. 결론 먼저

| 지표 (사전에 실제 도달한 어절 기준: 맞는 말 402 / 오타 405) | 현행 | 권장 조합 ②(휴리스틱만) | ② + 허용목록 58어 | 참고: 조합 ③(정탐 무손실) + 허용목록 |
|---|---|---|---|---|
| **오탐(FP) — 맞는 말에 고침이 뜬 수** | **117 (29.1%)** | 53 (13.2%) | **9 (2.2%)** | 18 (4.5%) |
| 정탐(TP) — 오타를 정답으로 고친 수 | 165 | 151 | **151** | 165 |
| 정탐 손실 | — | 14 | 14 | 0 |
| 오답 고침(wrong pick) — 오타에 *틀린* 고침이 뜬 수 | 88 | 81 | 81 | 84 |

- 맞는 말 전체(1,006어) 대비 오탐률은 **11.6% → 0.9%**. "오탐 제로" 원칙에는 여전히 못 미치지만, 남는 9건은 전부 표준 표기가 따로 있는 외래어(화이팅·런닝·후라이드·쉐이커·스쿼트)와 채팅 축약(했슴·알겠슴·꼬옥)·희귀어(짐브로)라 **규칙이 아니라 편집 판단의 영역**이다(§3, §6).
- 정탐 손실 14건은 전부 "정답이 Hunspell 1위 + 오타를 둘로 쪼갠 띄어쓰기 변형이 2위" 꼴(몰라써·뭐라구·이따바·감사헙니다…)이다. 손실 0으로 가려면 H1 대신 H1r(§5)을 쓰면 되지만 오탐이 9→18로 는다. **오탐 제로 원칙을 따르면 ②**.
- 허용목록만 단독으로 얹어도 FP 117→60, TP 손실 0 이다. 즉 휴리스틱과 허용목록은 절반씩 기여하며 겹침이 작다.

**가장 큰 원인 3개**

1. **사전 미수록 어휘(외래어·신조어·브랜드·지명)** — 현행 FP 117 중 휴리스틱으로 못 지우는 53건이 전부 이것이고(§2), 오타 쪽에서도 `no_candidates`/`no_distance1_candidate` 대다수와 wrong pick 32건(정답이 후보에 없음)의 뿌리다. 아메리카노·마라탕·라떼·닭가슴살은 **맞는 말이 오탐이 되고 그 오타는 못 고친다** — 양쪽 손실의 같은 뿌리.
2. **붙여 쓴 복합어 + Hunspell 의 'twowords' 변형** — 운동중→운동장, 먹방→석방, 심쿵→심중, 카페라떼→카페라네 등 53건. 현행 규칙(`koreanDictionaryRules.ts:161`)은 안전 후보가 **둘 이상일 때만** 띄어쓰기 변형을 포기 신호로 쓰는데, 복합어는 안전 후보가 하나뿐인 경우가 대부분이라 그 신호가 무력하다.
3. **3층 '음절 편집거리 1' 필터와 자모 동점 '앞엣것 우선'** — typo-corpus 300어에서 wrong pick 68건이 TP 103건의 66%. 연음·받침 오타(마싯어→맛있어, 드러→들어, 여페→옆에)는 두 음절이 동시에 바뀌어 거리 2 인데 필터가 정답을 버리고 엉뚱한 거리 1 낱말(마시어·뜨러·여파)을 내보낸다. 좋와→조와, 설레여→설레려, 부페→부패, 제쥬→제자는 정답이 후보에 있고 자모 거리도 동점인데 `koreanDictionaryRules.ts:167` "동점이면 앞엣것"으로 진다. 이 축은 오탐이 아니라 **오답 고침**이라 위 표의 FP 에 안 잡히지만 사용자 체감은 같다.

부수 발견(2층에 닿지 않아 표 밖): `collectTokens` 의 '아/야' 끝 어절 제외(`koreanDictionaryRules.ts:96`)가 커플 채팅 최다 오타 괜찬아·귀찬아를 사전에 보내지도 않는다 — 물었다면 둘 다 정답. `pickSafeSuggestion` 주석(`:141-143`)이 예시로 든 '귀찬아'가 실제로는 도달하지 않는 셈이다. 반면 조아는 필터 덕에 조라 오교정을 피했다. 별건으로 분리.

## 1. 방법

### 1.1 엔진

- 진짜 Hunspell **1.7.2 CLI**(`/usr/bin/hunspell`, Debian `1.7.2+really1.7.2-10build3`)에 저장소 사전 `frontend/modules/korean-spell/dict/ko.{aff,dic}`(0.7.94)을 물렸다. 래퍼 `scratchpad/spell/dict.py suggest-json` 이 어절을 `^어절` 한 줄씩 넣어 토크나이저 개입이 없다.
- 3층은 저장소 TS 를 **그대로 임포트**해 돌렸다(`scratchpad/spell/h/h.mjs` 가 `koreanDictionaryRules.ts`·`koreanSpellCheck.ts` 를 tmp 로 복사해 `collectTokens`/`stripNasalEnding`/`pickSafeSuggestion`/`checkKoreanSpelling` 호출). 앱의 `checkWithDictionary` 배선(`koreanDictionary.ts:68-96`: tokens → lookup → ㅇ받침 벗김 재조회 → suggest → pick)을 `pipeline.sh` 가 같은 순서로 재현한다.
- 판정 정의(`h/report.py`): "사전에 도달" = tokens 통과 && known=false && ㅇ받침 벗긴 형이 사전에 없음. FP = 도달한 맞는 말 중 pick≠null. TP = 도달한 오타 중 pick==정답. wrong = 도달한 오타 중 pick∉{null, 정답}. 1층이 먼저 잡는 오타 22건은 별도 표기.

### 1.2 코퍼스(도메인 5개)

| 도메인 | 맞는 말 | 오타 | 비고 |
|---|---|---|---|
| couple-chat | 200 | 60 | 애교체·붙여쓰기 채팅체 다수 |
| fitness | 180 | 50 | 운동 종목·부위·보충제 |
| food-cafe | 200 | 50 | 메뉴·브랜드 외래어 |
| loanword-brand-place | 220 | 40 | 브랜드·앱·지명·신조어 |
| typo-corpus | 256(정답 표기) | 300 | 받침 85·자판 70·어미 65·모음 48·자음 32 |
| **합계(원시)** | 1,056 | 500 | 도메인 간 중복(보고싶어·카톡·셀카…) 제거 후 **1,006 / 471** |

파일: `scratchpad/spell/corpus_{couple-chat,fitness,food-cafe,loanword-brand-place,typo-corpus}.json`. 오타 코퍼스는 `build_typo.py` 로 유형별 생성 후 손으로 검수했다. 코퍼스는 감사자가 작성한 것이라 실제 사용 빈도 분포를 대변하지 않는다 — 각 오탐에 붙인 frequency(very_common/common/rare)는 감사자 추정이다.

### 1.3 실기기 차이 위험 — 요약

엔진 코드는 동일하다(번들 `cpp/hunspell/*` 16개 파일이 upstream v1.7.2 태그와 바이트 단위 일치, ICONV/OCONV 는 라이브러리 내부 `hunspell.cxx:490/1078` 에서 적용되어 CLI·네이티브 모두 raw 문자열을 넘김). 1,189어 대조에서 known·후보·순서 100% 일치. **그러나 suggest 의 `clock()` 기반 타임아웃(50/100/250ms)이 프로세스 CPU 시간이라 RN 앱에서는 하네스보다 먼저 잘린다.** 하네스는 유휴 x86 단일 스레드라 **오탐의 하한을 측정한 것**이며 상한이 아니다. 상세 §8.

## 2. 확정 오탐 표

하네스 실측 117건(중복 제거) 중 대표를 도메인별로 싣는다. **개별 재검증(어절 단건 재실행)은 세션 한도로 생략**했고, 아래는 `h/eval.json` 의 `picks.current` 값을 그대로 옮긴 것이다. "화면 문구"는 앱이 `wrong → right` 로 보여주는 것(사유는 공통 `'사전에 없는 말이에요'`, `koreanDictionaryRules.ts:24`).

원인 분류: `compound_spacing`(붙여 쓴 복합어, Hunspell 이 띄어쓰기 변형을 냄) · `loanword_missing`(외래어 미수록) · `proper_noun`(브랜드·지명) · `neologism`(신조어·축약) · `negation_prefix`(안/못 붙여쓰기) · `inflection_missing`(활용형 미수록) · `standard_spelling_actually`(표준 표기가 따로 있음 → §3) · `other`.

| 도메인 | 어절 | 화면에 뜨는 고침 | 원인 | 후보(순서대로) | 빈도 |
|---|---|---|---|---|---|
| couple-chat | 보고싶어 | 보고시어 | compound_spacing | 보고시어·보고 싶어·보고서 | very_common |
| couple-chat | 이따봐 | 이따 | compound_spacing | 이따 봐·이따 | very_common |
| couple-chat | 짜증나 | 짜증 | compound_spacing | 짜증 나·짜증 | very_common |
| couple-chat | 씻고올게 | 씻겨올게 | compound_spacing | 씻고 올게·씻겨올게 | very_common |
| couple-chat | 잘다녀와 | 다녀와 | compound_spacing | 잘 다녀와·다녀와 | very_common |
| couple-chat | 잘먹었어 | 자먹었어 | compound_spacing | 잘 먹었어·자먹었어 | common |
| couple-chat | 배달시킬까 | 발달시킬까 | compound_spacing | 배달키실까·배달 시킬까·발달시킬까 | common |
| couple-chat | 자러갈게요 | 질러갈게요 | compound_spacing | 자러 갈게요·질러갈게요 | common |
| couple-chat | 잘가 | 잘까 | compound_spacing(변형이 후보에 없어 규칙 무력) | 잘까·짤까·찰까·…(15) | very_common |
| couple-chat | 안가 | 난가 | negation_prefix | 난가·아가·안감·…(15) | common |
| couple-chat | 오키 | 오기 | neologism | 오기·노기·노키·…(15) | very_common |
| couple-chat | 남친 | 남진 | neologism | 남진·나친·남촌·…(15) | common |
| couple-chat | 했슴 / 알겠슴 | 했음 / 알겠음 | neologism(축약) | 했음·해금 / 알겠음·알고리듬 | common |
| couple-chat | 심쿵 | 심중 | neologism | 심중·심 쿵 | common |
| couple-chat | 베이비 | 베이기 | loanword_missing | 베이기·베이지·베이리·베이니·베이비시터 | common |
| couple-chat | 웅웅 / 꼬옥 | 영웅 / 꼬오 | other | 영웅 / 꼬오·꼭꼭 | common |
| fitness | 스쿼트 | 스커트 | loanword_missing(표준은 스쾃) | 스커트 | common |
| fitness | 런지 | 넌지 | loanword_missing | 얹지·넌지·건지·…(8) | common |
| fitness | 풀업 | 풀어 | compound_spacing | 풀어·풀 업 | common |
| fitness | 푸시업 | 푸시어 | loanword_missing | 푸시어·푸시시 | common |
| fitness | 홈트 | 홈통 | neologism | 홈통 | very_common |
| fitness | 웨이트 | 웨이터 | loanword_missing | 웨이터·쿠웨이트 | common |
| fitness | 트레이너 | 트레이닝 | loanword_missing | 트레이닝 | common |
| fitness | 루틴 | 라틴 | loanword_missing | 라틴·루튼·루턴·루빈·루핀 | common |
| fitness | 인바디 | 잇바디 | proper_noun | 잇바디 | common |
| fitness | 닭가슴살 | 가슴살 | compound_spacing | 닭 가슴살·가슴살 | very_common |
| fitness | 오트밀 | 오자밀 | loanword_missing | 오자밀 | common |
| fitness | 운동중 / 운동끝 / 운동갈래 | 운동장 / 운동원 / 운동할래 | compound_spacing | 운동장·운동 중 / 운동 끝·운동원 / 운동할래·운동 갈래 | very_common |
| fitness | 헬스갔어 | 헬스겠어 | compound_spacing | 헬스겠어·헬스 갔어·흘러갔어 | very_common |
| fitness | 땀났어 | 탐났어 | compound_spacing | 담았어·탐났어·땀 났어 | common |
| fitness | 인증샷 / 바프 | 인증서 / 하프 | neologism | 인증서 / 하프 | common |
| fitness | 대흉근 / 승모근 / 증량 | 대흉년 / 스모근 / 정량 | other(전문어 미수록) | 대흉년 / 스모근 / 정량·중량·증가량 | rare |
| food-cafe | 아메리카노 | 아메리카로 | loanword_missing | 아메리카로·아메리카오·아메리카나·…(8) | very_common |
| food-cafe | 마라탕 | 마라톤 | compound_spacing | 마라 탕·마라톤 | very_common |
| food-cafe | 카페라떼 / 바닐라라떼 | 카페라네 / 바닐라라네 | compound_spacing(표준은 라테) | 카페라네·카페라 떼·카페테리아 | common |
| food-cafe | 요거트 | 요거 | loanword_missing | 요거 | common |
| food-cafe | 스무디 / 에이드 | 스무 / 에이든 | loanword_missing | 스무 / 으이데·에이든·…(8) | common |
| food-cafe | 배민 | 백민 | neologism | 뱀인·백민·배만·…(8) | very_common |
| food-cafe | 맘스터치 | 마스터치 | proper_noun | 마스터치 | common |
| food-cafe | 웨이팅 / 런치 / 디너 / 하이볼 | 웨이터 / 린치 / 시너 / 하여볼 | loanword_missing | — | common |
| food-cafe | 먹방 / 배달시키자 / 당떨어져 | 석방 / 발달시키자 / 동떨어져 | compound_spacing | 석방·먹 방 / … | common~very_common |
| food-cafe | 새콤달콤 / 매콤 | 새콤달콤함 / 매옴 | inflection_missing | 새콤달콤함 / 매옴·매봄 | rare |
| loanword-brand-place | 카톡 / 틱톡 | 톡톡 | proper_noun | 톡톡 | very_common / common |
| loanword-brand-place | 셀카 | 셀까 | neologism | 샐까·셀까·셀라 | very_common |
| loanword-brand-place | 유튜브 | 튜브 | compound_spacing | 유 튜브·튜브 | very_common |
| loanword-brand-place | 쿠팡 / 티빙 / 땡큐 | 팡팡 / 빙빙 / 땡땡 | proper_noun·compound_spacing | 팡팡 / 티 빙·빙빙 / 땡 큐·땡땡 | very_common~common |
| loanword-brand-place | 다이소 | 다리소 | proper_noun | 다리소·다니소·…(15) | very_common |
| loanword-brand-place | 올리브영 | 올리브유 | compound_spacing | 올리브 영·올리브유 | very_common |
| loanword-brand-place | 최애 / 노잼 / 불멍 / 극혐 / 아싸 / 핵인싸 / 플렉스 / 알쓰 | 최대 / 노점 / 불명 / 극함 / 아사 / 핵인가 / 콤플렉스 / 알뜰 | neologism(·compound_spacing) | — | very_common~rare |
| loanword-brand-place | 에어팟 / 패딩 / 에코백 / 마스크팩 / 맨투맨 | 에어컨 / 푸딩 / 에어백 / 마스크 / 투맨 | loanword_missing·compound_spacing | — | common |
| loanword-brand-place | 압구정 / 다낭 / 발리 / 카카오 / 구글 / 비비큐 / 테슬라 / 이마트 / 디스코드 | 압정 / 다랑 / 발이 / 파카오 / 궁글 / 바비큐 / 테실라 / 이마 / 디스코든 | proper_noun | — | common~rare |
| loanword-brand-place | 팔로우 / 팔로워 | 팔로의 | compound_spacing | 팔로의·팔로 우·알로에 | common |
| typo-corpus | 어떡해 | 어떠해 | inflection_missing | 어떠해·어떡하다 | very_common |

도메인별 화면 노출 FP(중복 포함): couple-chat 23 · fitness 35(진성 33) · food-cafe 25(진성 24) · loanword-brand-place 39(proper_noun 13·neologism 7·loanword_missing 4 는 제안안 후 잔존분) · typo-corpus 2. 이전 감사(일상 어휘 71어, 오탐 15)와 겹치는 것: 보고싶어·잘먹었어·이따봐·안가·카톡·아메리카노·마라탕·스쿼트·런지·닭가슴살·요거트·베이비·셀카·프로포즈·올리브영. 신규는 100건 남짓.

**침묵(unknown 이지만 pick null, 화면에 안 뜸)**: couple-chat 60(44 + ㅇ받침 면제 16)·fitness 81·food-cafe 76·loanword 93·typo-corpus 4. 즉 사전이 모르는 맞는 말의 대부분은 3층이 이미 눌러 주고 있고, 뚫리는 것은 "거리 1 후보가 우연히 하나 있는" 경우다.

## 3. 정탐으로 재분류된 것 — 표준 표기가 따로 있는 말

스윕이 `standard_spelling_actually` 로 표시한 4건. 국립국어원 외래어 표기법 기준으로 검사기 지적이 **맞다**. 단 1층 머리 주석(`koreanSpellRules.ts:9`)이 "외래어 표기는 통째로 범위 밖 — 브랜드·메뉴명과 못 가른다"고 선언한 만큼, 2층이 이를 지적하는 것이 정책과 어긋나는지는 판단이 필요하다(§9).

| 어절 | 고침 | 표준 표기 | 비고 |
|---|---|---|---|
| 화이팅 | 파이팅 | 파이팅 | very_common. 채팅에서 압도적으로 '화이팅' |
| 런닝 | 러닝 | 러닝 | very_common |
| 후라이드 | 프라이드 | 프라이드 | 메뉴명(후라이드치킨)과 충돌 |
| 쉐이커 | 에이커 | 셰이커 | 표준 지적은 맞지만 **고침(에이커)은 틀림** — 실질적으로 오답 고침 |

비슷한 경계: 스쿼트(표준 스쾃, 통용 스쿼트) · 프로포즈(표준 프러포즈) · 카페라떼(표준 라테) · 컷팅(표준 커팅). 오타 코퍼스에 넣었던 요구르트→요거트는 요구르트가 표준국어대사전 등재어라 검사기 침묵이 옳음(FN 아님).

## 4. 놓침(FN) 단계별 집계와 대표 예

오타 471(중복 제거) 중 1층이 잡는 22건을 제외한 사전 경로에서, 정답을 못 낸 것의 죽은 단계.

| 단계 | 뜻 | couple-chat | fitness | food-cafe | loanword | typo-corpus | 대표 예 |
|---|---|---|---|---|---|---|---|
| `tokens_filtered` | `collectTokens` '아/야' 끝 제외(`koreanDictionaryRules.ts:96`) — 사전에 가지도 않음 | 3 | 0 | 0 | 0 | 10 | **괜찬아·귀찬아**(물었다면 정답), 조아(물었다면 조라 오교정), 업잔아·잇잔아·햇잔아·어니야 |
| `dictionary_knows_it_homograph` | ko.dic 이 known=true 로 읽어 오타를 가림 | 2 | 0 | 1 | 2 | 43 | 마자(맞아)·졸러(졸려)·업서/업다/업는데(없-)·잇다(있다)·가치(같이)·바다(받아)·근대(근데)·네일(내일)·진자(진짜)·어떠케·그러케·요기오·판굔 |
| `spacing_abort` | 안전 후보 여럿 + 띄어쓰기 변형 → 포기(`:161`) | 11 | 3 | 4 | 7 | 49(정답이 후보에 있던 것 33) | 안년→안녕·머해→뭐해·**사랑헤·피곤헤·좋아헤·고마어·외로어**('X헤/X어' 군)·식딴→식단·채중→체중·짬봉→짬뽕·파스따·소세지·애풀→애플·잠씰→잠실·해운데→해운대·실타→싫다·만타→많다·부억→부엌·오눌→오늘·나두→나도 |
| `no_distance1_candidate` | 후보는 있으나 전부 음절 거리 ≥2 | 6 | 23 | 3 | 15 | 17(정답 1위인데 버린 것 6) | **스테잌→스테이크·케잌→케이크·도너츠→도넛(단일·정답인데 거리 2)**, 마잤어→맞았어·괜찬타→괜찮다·드러와→들어와·재밋엇어→재밌었어·비스태→비슷해, 스쿼드·플렝크·데드리프드·유투브·갤렉시·멘뭉·소확헹 |
| `no_candidates` | Hunspell 후보 0 또는 전부 무관(MAXDIFF 0) | 0 | 1 | 12 | 0 | 0 | 런닝머쉰, 아메리까노·마까롱·카푸치뇨·크로아상·마라땅·탕후르·스타벅쓰·버거컹·카라멜 |
| `wrong_pick` | **틀린 고침이 화면에 뜸** | 7 | 4 | 6 | 7 | 68 | 아래 표 |
| **합계 FN** | | 29 | 31 | 26 | 31 | 187 | |
| (참고) TP 현행 | | 17 | 19 | 21 | 9 | 103 | |

### 4.1 wrong pick 88건의 세 갈래(typo-corpus 68건 기준 분해)

| 갈래 | 수 | 대표 | 고칠 방법 |
|---|---|---|---|
| 정답이 후보에 없음(MAXDIFF 0, 미수록·붙여쓰기) | 32 | 시러→시어, 마싯어→마시어, 조타→조다, 가타→가다, 끄너→끄러, 보고십어→보고시어, 라뗴→라데, 덤벸→덤불, 유산쏘→유산도, 아이퐁→아이피 | 규칙으로 불가. add_dic 로 정답 수록(§7) |
| 정답이 후보에 있으나 음절 거리 2 라 필터 탈락 | 21 | 머거→머건(먹어), 드러→뜨러(들어), 여페→여파(옆에), 아페→아파(앞에), 힘드러→힘더러(힘들어), 마자요→마차요, 나제→나체(낮에) | 거리 2 허용은 H5 실측상 오탐 +22 라 기각. "정답 후보가 거리 2 로 존재하면 거리 1 후보를 내지 않는다"는 역방향 규칙은 미측정(§9) |
| 정답도 거리 1 후보인데 자모 동점·열세로 다른 것 선택(`:167`) | 15 | 좋와→조와, 설레여→설레려, 부페→부패, 제쥬→제자, 조아요→조나요, 아디→아다, 그레→그에, 핬어→헸어, 모해→못해, 졸료→졸라 | 동점 시 포기(H6)는 TP 60 손실로 기각. 모음 유사도(ㅐ/ㅔ, ㅠ/ㅜ) 가중은 미측정 |

### 4.2 신규 구조 발견

- (a) **'X헤/X어' 오타군**은 Hunspell 이 'X 헤' 변형을 내는 순간 현행 규칙에 전부 죽는다(사랑헤·피곤헤·좋아헤·고마어·외로어·미안헤·행복헤). 심심헤·속상헤만 변형이 안 나와 우연히 정탐.
- (b) 좋와·설레여·부페·제쥬는 **정답이 후보에 있고 자모 거리도 동점**인데 '앞엣것 우선'으로 진다. Hunspell 순서는 후보 생성 단계 순서(REP→MAP→swap→…→ngram)라 "그럴듯한 순"이 아니다(주석 `:141` 이 이미 인정).
- (c) 외래어 정답이 **단일 후보로 정확히** 나오는데 음절 거리 2 라 버려지는 군(스테잌·케잌·도너츠). 1층 주석대로 범위 밖이면 침묵이 맞고, 그렇다면 일관성 있음.

## 5. 3층 휴리스틱 설계와 실측표

측정: `scratchpad/spell/h/pipeline.sh` → `h/eval.json`(어절별 후보·safe·자모거리·플래그) → `python3 h/report.py <variant>`. 기준선 FP 117 / TP 165 / wrong 88. 조합 ②③ 은 `eval.json` 의 `flags` 를 인라인 python 으로 OR 해 재계산했다(본 감사에서 재실행해 일치 확인).

| 이름 | 규칙(적용 위치) | fp_removed | tp_lost | 비고 |
|---|---|---|---|---|
| **H1** 띄어쓰기 변형 있으면 포기 | `pickSafeSuggestion` `:161` 의 `safe.length > 1 &&` 삭제 | **53** | **14** | 손실 14 = 감사헙니다·뭐라구·몰라써·이따바·배고푸다·삼게탕·끈났어·맛업다·먼나자·바나너·바빠써·힘들어써·고마와요·근육퉁(전부 정답 1위 + 쪼갠 변형 2위). wrong 88→83 |
| **H1r** 변형이 고른 후보보다 *앞* 순위일 때만 포기 | `:174` 앞: `const si=candidates.findIndex(c=>isSpacingVariant(word,c)); if(si>=0 && si<candidates.indexOf(best)) return null;` | 32 | 0 | Hunspell 순서에 기댐. 복합어 21건(운동중·먹방·심쿵·노잼·헬스갔어…)은 변형이 2위라 남음 |
| **H2** 안/못 + 나머지가 사전에 있으면 면제 | `koreanDictionary.ts:74-81` retry 배치에 `t.text.slice(1)` 추가 | 1 | 0 | 코퍼스 밖 spot-check: 못먹어→헛먹어, 안해→난해 도 현행 오탐 |
| **H3** '고싶' 포함 어절은 묻지 않음 | `collectTokens` `:96` 옆 `if (/고싶/.test(word)) continue;` | 2 | 0 | 보고싶어·보고싶었어요. 보고십어·보고시퍼는 못 막음 |
| H4 안전 후보 ≥2 전부 마지막 음절만 다르면 포기 | safe 계산 직후 | 9 | 15 | **기각** — 한국어 오타 대부분이 어미 오타라 신호가 정탐·오탐을 못 가름. H4b(≥3) 5/5, H4∧H6 8/13 도 나쁨 |
| **H4c** H4 의 안전형(어절 ≥4음절 && safe ≥3) | 같은 자리 | 2 | 0 | 아메리카노·디스코드만 |
| H5 거리 2 허용(비띄어쓰기 후보 정확히 1 && 자모 ≤2) | safe 비었을 때 | 0 (FP **+22**) | 0 (TP +9) | **기각** — 갤럭시→갤러리, 마카롱→마카로니, 스벅→슬쩍, 인스타→린스다 등 오탐 22 + 오답 고침 8 신규. 실타·시러도 못 얻음 |
| H6 자모 동점이면 포기 | — | 23 | 60 | **기각** |
| **H7** 안전 후보 전부 '한 음절 뺀 꼴'이면 포기 | safe 계산 직후 `if (safe.every(c=>c.length===word.length-1)) return null;` | **20** | 0 | 요거트→요거, 스무디→스무, 이따봐→이따, 압구정→압정, 닭가슴살→가슴살, 유튜브→튜브, 짜증나→짜증 |
| **H10** 전부 '끝에 한 음절 덧붙인 꼴'이면 포기 | `if (safe.every(c=>c.length===word.length+1 && c.startsWith(word))) return null;` | 1 | 0 | 새콤달콤→새콤달콤함. 선택 사항 |
| **H11** 고침이 2음절 반복어인데 원어절은 아니면 포기 | `:174` 앞 `if (best.length===2 && best[0]===best[1] && word[0]!==word[1]) return null;` | 5 | 0 | 카톡·틱톡→톡톡, 쿠팡→팡팡, 티빙→빙빙, 땡큐→땡땡 |
| **H12** 원어절이 2음절 반복어면 묻지 않음 | `collectTokens` `if (word.length===2 && word[0]===word[1]) continue;` | 1 | 0 | 웅웅→영웅 |

**조합**

| 조합 | FP | TP | wrong | 판단 |
|---|---|---|---|---|
| 현행 | 117 | 165 | 88 | |
| ① 과제 지정 H1+H2+H3+H4 | 54 | 136 | 71 | H4 손실 15 > 이득 9 → H4 제외 |
| **② 권장(오탐 우선) H1+H2+H3+H4c+H7+H10+H11+H12** | **53** | **151** | **81** | 남는 53 전부 미수록 어휘 + 잘가 → 허용목록 영역 |
| ③ 정탐 무손실 H1r+H2+H3+H4c+H7+H10+H11+H12 | 72 | 165 | 84 | ② + 복합어 19(운동중·헬스갔어·먹방·심쿵·노잼·풀업·팔로우·카페라떼·프로포즈…) |
| ② + 허용목록 58어 | **9** | 151 | 81 | §6 |
| ③ + 허용목록 58어 | 18 | 165 | 84 | |
| 허용목록 58어만 | 60 | 165 | 88 | 배포 위험 최소 옵션 |

H1 vs H1r 은 설계 결정 사항: "오탐 제로"를 문자 그대로 따르면 H1(정탐 14 손실 감수), 채팅 오타 X써/X구 고침을 지키려면 H1r(복합어 오탐 19 잔존). 본 감사는 저장소 원칙("맞는 말을 틀렸다고 하는 쪽이 훨씬 성가시다")에 따라 ②를 권장한다.

## 6. 허용 목록 초안과 배치

### 6.1 초안(58어, 코퍼스에서 FP 로 확인된 것만 — `allow∩typos = ∅` 확인)

```
어떡해 잘가 매콤 증량 대흉근 승모근 근성장 근지구력
심쿵 남친 여친 오키 셀카 최애 노잼 불멍 먹방 극혐 아싸 알쓰 플렉스 핵인싸 인증샷 바프
홈트 웨이트 웨이팅 인터벌 트레이너 루틴 런지 버피 풀업 푸시업 스트랩 오트밀 인바디
베이비 에이드 스무디 요거트 하이볼 디너 런치 패딩 에코백 에어팟 팔로우 팔로워
넷플 배민 다이소 맘스터치 카카오 구글 테슬라 발리 비비큐
```

넣지 않은 것(판단 필요): 화이팅·런닝·후라이드·쉐이커(표준 표기 따로 있음, §3) · 스쿼트(표준 스쾃) · 했슴·알겠슴·꼬옥(축약, 고침 '했음/알겠음'이 사실 정답) · 짐브로(희귀). ② + 이 목록 뒤 잔존 FP 9 = 정확히 이 9어.

### 6.2 배치

- 위치: `koreanDictionary.ts:68` `const tokens = collectTokens(text)` 바로 뒤, 네이티브 `lookup` 앞에서 `tokens.filter(t => !KNOWN_WORDS.has(t.text))`.
- 자료구조: 별 파일 `koreanAllowlist.ts` 의 `Set<string>` 상수. `scripts/verify-spellcheck.mjs` 의 오탐 방지 문장 목록에 같은 어휘를 함께 등록해 회귀를 막는다(`verify-spellcheck.mjs:263,348` 이 `collectTokens`·`pickSafeSuggestion` 을 직접 검증하는 구조를 그대로 탄다).
- 이유: ① `collectTokens` 는 순수 토크나이저라 데이터(어휘)를 섞지 않는다 ② lookup 앞에 두면 네이티브 왕복·suggest 를 아예 안 부른다(suggest 는 어절당 중앙값 77ms, §8) ③ JS 라 **EAS Update 로 배포**(네이티브 빌드 불필요, `CLAUDE.md` §6 빌드 vs 업데이트) ④ 웹(`KoreanSpellModule.web.ts:17` suggest 가 빈 배열)과 네이티브가 같은 규칙.
- 한계: 어절 exact match 라 조사 결합형(아메리카노를·카톡으로)은 못 잡는다. 필요하면 `/(은|는|이|가|을|를|도|만|에|로|의|랑|이랑|까지|부터|처럼|보다|한테|에서|으로)$/` 를 한 번 벗긴 형도 Set 에 묻는 2차 조회 — **미측정**.

## 7. 네이티브 사전(add_dic) 안

실측(`scratchpad/spell/h/adddic.cpp`, Hunspell 1.7.2 C++ API, `extra.dic` 6어 `/25` 플래그):

- `add_dic()` 반환 0(성공). 아메리카노·스쿼트·런지·카톡·홈트·보고싶어 모두 spell=1.
- **추가 낱말이 suggest 후보로도 올라온다**: 스쿼드→[스쿼트](현행 [스캔들]), 아메리카로→아메리카노 3위. 즉 JS 허용목록(침묵만)과 달리 **정탐을 늘린다** — §4.1 첫 갈래(정답이 후보에 없음 32건)와 `no_candidates` 12건, `no_distance1_candidate` 의 미수록군(스쿼드·인바뒤·트래이너·라뗴·유투브·갤렉시)이 대상.
- 한계: 붙여쓰기 복합은 여전히 안 됨(홈트했어→'홈트 했어', 런지햇어→벗어던지어). 후보 순서는 Hunspell 이 정하므로 3층 규칙은 그대로 필요. 조사 결합형 인식에는 ko.aff 플래그 체계(`/25` 등)를 맞춰야 하는데 **미검증**.
- 비용: `KoreanSpellCore.cpp:33` `new Hunspell(...)` 뒤 `add_dic` 호출 + `dict/extra.dic` 을 podspec/gradle 에셋으로 번들 + Android `KoreanSpellModule.kt:140` `DICT_VERSION` 갱신(안 올리면 기기가 옛 사전을 계속 씀). `modules/` 네이티브 변경이라 **EAS 빌드 필요**, 웹에는 효과 없음.
- 권장 순서: 1차 JS 허용목록(Update)으로 오탐을 끊고, 다음 네이티브 빌드 타이밍에 같은 목록을 `extra.dic` 으로도 실어 정탐을 늘린다. 두 목록의 원본을 하나로 두어 어긋나지 않게 한다.

## 8. 실기기에서만 확인 가능한 것 — parity 결과

### 8.1 일치하는 것(확인)

- 번들 `frontend/modules/korean-spell/cpp/hunspell/*.cxx|hxx` 16개 파일 전부 upstream v1.7.2 태그와 md5/cmp 동일. `docs/SPELLCHECK_NATIVE_ENGINE_REANALYSIS_2026-09-03.md:173` 의 "1.7.2 원본" 기술 정확.
- 시스템 CLI 의 유일한 차이인 Debian/LibreOffice 패치(사전 항목 255바이트 초과 허용, hunspell#903)는 ko.dic 최장 항목이 84바이트라 **효과 0**.
- ICONV/OCONV 는 `hunspell.cxx:490/1078`(입구)·`451/1030`(출구)에서 라이브러리가 적용. 네이티브(`KoreanSpellCore.cpp:56-66`)·JNI·iOS 브리지 어느 쪽도 정규화·트림 없음. 하네스 `dict.py` 도 raw.
- 번들 소스를 직접 컴파일한 바이너리(`scratchpad/bundled/bundled_hs`) vs 시스템 CLI: 어절 1,189개 known 1,189/1,189 일치, 후보 목록·순서 1,189/1,189 일치.
- `spell()` 경로에는 시간 제한이 없다(`clock()` 은 `hunspell.cxx:1101-1219` suggest 구간에만). → known 판정(헬스·데이트·뽀뽀·커플·맛집 있음, 업서·마자 있음, ㅇ받침 면제)은 **기기에서도 동일**.

### 8.2 달라지는 것 — suggest 후보 목록이 뒤에서부터 잘린다

- 제한 3겹(`atypes.hxx`): TIMELIMIT 50ms / TIMELIMIT_SUGGESTION 100ms / TIMELIMIT_GLOBAL 250ms. `clock()` 은 Linux·bionic·Darwin 모두 **프로세스 전체 CPU 시간**이라 RN 앱(JS·UI·Hermes 스레드)에서는 하네스보다 먼저 잘린다.
- 이 사전은 SFX 98,577개·COMPOUNDRULE 14개라 후보 계산이 무겁다: x86 -O2 기준 660어절 suggest **중앙값 77ms, ≥100ms 218개, ≥250ms 22개**(먹을거같아 337ms, 늦을것같아 314ms).
- 같은 프로세스에 바쁜 스레드를 넣어 재현(`scratchpad/bundled/main_busy.cpp`, 결과 `runs.json`):

| 부하(≈시계 배속) | 후보 목록 짧아짐 | 띄어쓰기 변형 전부 소실 | 3층 판정 뒤집힘 |
|---|---|---|---|
| 2배 | 3/660 | 0 | 0 |
| 4배 | 21 | 1 | **2** — 보고싶었어 3후보→2후보로 '보고시었어' 오탐 신규(현행) |
| 8배 | 67 | 1 | **8** — 보고싶네→보고시네, 보고싶어요→보고시어요 신규; 보고싶었어는 **제안안(H1)에서도** 뒤집힘; 반대로 닭가슴살·놀고있어·언제만나는 유일 후보가 사라져 오탐 소멸 |
| 16배 | 131 | 43 | **30** — 잘먹었어→잘라먹었어, 커플사진→커플까진, 잘잤어→잘났어 |

잘리는 순서는 ngram(마지막) → twowords 띄어쓰기 변형 → 편집 단계 후보. **H1/H1r 의 포기 신호(띄어쓰기 변형)가 정확히 먼저 잘리는 부분**이라, 하네스에서 지운 오탐 일부가 중저가 안드로이드 + 채팅 애니메이션 중(4~8배 구간이 현실적)에는 되살아난다. 방향은 (a) 유일 후보 소실로 오탐이 사라지는 쪽과 (b) 포기 신호 소실로 오탐이 생기는 쪽이 섞이며 실측은 (b)가 더 많았다. 같은 기기에서도 부하에 따라 판정이 바뀌므로 "어제는 안 그랬는데" 류 제보는 여기서 나온다.

### 8.3 실기기 검증 절차(하네스 일치를 확정하는 어절 10개)

3층 판정이 아니라 **raw `KoreanSpell.suggest(word)` 배열과 소요 ms** 를 비교해야 시간 제한 잘림과 엔진 차이를 가를 수 있다. release 빌드, 지원 기기 중 가장 느린 것, ① 화면 정지 ② 채팅 목록 스크롤 중 두 번.

| # | 어절 | 하네스 기대값 | 확정하는 것 |
|---|---|---|---|
| 1 | 사랑 | known=true | 로드·ICONV(`KoreanSpellCore.cpp:37` load 검증과 동일) |
| 2 | 업서 | known=true | 사전 파일 동일성(동형이의 가림 재현) |
| 3 | 뭐했어용 | 지적 없음 | `stripNasalEnding` + spellMany 배선 |
| 4 | 안녕하세이 | [안녕하세요, 안녕하다] | #903 카나리, OCONV 출력이 NFC |
| 5 | 제작년 | [재작년] → 지적 | 정탐 양성 대조(REP), 유일 후보 |
| 6 | 귀찬아 | 후보에 귀찮아·귀잖아 둘 다 → 귀찮아 | 자모 동점 해소(단, 앱에선 '아' 끝 필터로 도달 안 함 — suggest 직접 호출로 확인) |
| 7 | 실타 | 1위 싫다, 3층 거부 | 후보 순서 일치(거리 2 거부) |
| 8 | 보고싶어 | [보고시어, 보고 싶어, 보고서] | 핵심 오탐 + 띄어쓰기 변형 + ngram 꼬리 |
| 9 | 보고싶었어 | [보고시었어, 보고 싶었어, 보고되었어] | **시간 제한 카나리** — 2개만 오면 4배 이상 잘리는 기기 |
| 10 | 먹을거같아 | [먹을거리](337ms) | 250ms 글로벌 컷 — `[]` 면 얼마나 느린지 척도, ms 기록 |

판독: #1~#7 이 다르면 엔진/사전 불일치(`DICT_VERSION`·asset 추출·번들 리소스). #8~#10 만 꼬리가 짧으면 시간 제한. 추가로 잘먹었어([잘 먹었어, 자먹었어])·이번거([이번 거, 이번과, 이번서])는 띄어쓰기 포기 신호가 기기에서 살아남는지 직접 보여준다.

### 8.4 잔여 위험(작음)

- JNI modified UTF-8(이모지 CESU-8): `collectTokens` 가 한글 음절 외 어절을 미리 버려 도달하지 않음.
- NFD 입력 붙여넣기: spell 통과, suggest 출력은 NFC → 편집거리 조건에 걸려 조용히 침묵(오탐 방향 아님).
- `DICT_VERSION`(`KoreanSpellModule.kt:140`, 0.7.94) 미갱신이 하네스≠기기의 가장 현실적 경로 — 코드가 아니라 운영 차이.
- 1.7.3(2026-05)은 타임아웃을 `std::chrono` 벽시계로 바꾸고 "입력어를 자기 후보로 내지 않음"이 들어갔다. 한쪽만 올리면 §8.2 특성이 갈리므로 하네스·번들을 **동시에** 올린다.

## 9. 미완 항목

| # | 항목 | 상태 | 비고 |
|---|---|---|---|
| 1 | 오탐 117건 개별 재검증(단건 재실행) | **미실시** | 세션 한도. `h/eval.json` 의 `picks.current` 일괄값에 의존. 재검증 시 `echo '["어절"]' \| python3 dict.py suggest-json \| node run.mjs pick-json` |
| 2 | H1 vs H1r 결정 | 판단 필요 | 오탐 우선(② FP 9 / TP 손실 14) vs 정탐 보존(③ FP 18 / 손실 0) |
| 3 | 표준 표기가 따로 있는 4어(화이팅·런닝·후라이드·쉐이커)+스쿼트를 허용목록에 넣을지 | 판단 필요 | 1층 주석 "외래어 표기는 범위 밖" 정책과 2층 동작이 어긋남. 쉐이커→에이커는 고침 자체가 틀림 |
| 4 | 허용목록 조사 결합형 2차 조회(아메리카노를) | 미측정 | §6.2 |
| 5 | add_dic 의 ko.aff 플래그 체계(조사 결합형 인식) | 미검증 | §7. 6어 spot-check 만 |
| 6 | 실기기 10어절 검증(§8.3) | 미실시 | 기기·release 빌드 필요 |
| 7 | 하네스에 어절별 suggest ms 기록·≥100ms "timing-fragile" 표시 | 미구현 | 저장소 수정 없이 `dict.py` 에 추가 가능 |
| 8 | "정답 후보가 거리 2 로 존재하면 거리 1 후보를 내지 않는다"(wrong pick 21건 대상) | 미측정 | §4.1 두 번째 갈래. H5 와 달리 침묵 방향이라 오탐 위험은 낮을 것으로 *추측* |
| 9 | 자모 동점 해소에 모음 유사도(ㅐ/ㅔ·ㅠ/ㅜ) 가중 | 미측정 | 좋와·설레여·부페·제쥬 등 15건 대상 |
| 10 | '아/야' 끝 필터가 삼키는 괜찬아·귀찬아, 동형이의 가림(업서·마자·졸러) | 범위 밖(별건) | 2층에 닿지 않아 본 감사 표에 없음. 별도 설계 필요 |
| 11 | 3층이 "포기 신호의 부재"를 확신으로 해석하는 구조(후보 ≤2 일 때 ngram 잘림 가능성) | 설계 과제 | §8.2 |
| 12 | 본 보고서의 `docs/` 커밋 | 미실시 | 저장소 수정 금지 조건. 위 경로로 저장 후 `verify-spellcheck.mjs` 오탐 방지 문장과 함께 커밋 권장 |

### 산출물(스크래치, 저장소 밖)

- 하네스: `/tmp/claude-0/-home-user-Doubly/52eaab22-383c-57a7-9aff-76ab32db2639/scratchpad/spell/{dict.py,run.mjs,corpus_*.json}` · `spell/h/{pipeline.sh,h.mjs,report.py,eval.json,sugg.json,legit_all.json,typos_all.json,adddic.cpp,extra.dic}`
- parity: `scratchpad/bundled/{main.cpp,main_busy.cpp,bundled_hs,busy_hs,eval.mjs,runs.json}`, upstream 소스 `scratchpad/up/{1.7.0,1.7.1,1.7.2,master,tools,lo.patch}`
- 읽은 저장소 파일: `frontend/src/utils/{koreanDictionary,koreanDictionaryRules,koreanSpellRules,koreanSpellCheck}.ts`, `frontend/scripts/verify-spellcheck.mjs`, `frontend/modules/korean-spell/{cpp/KoreanSpellCore.cpp,cpp/hunspell/*,android/src/main/cpp/jni.cpp,android/src/main/java/expo/modules/koreanspell/*.kt,ios/*,src/*.ts,dict/ko.aff,KoreanSpell.podspec,android/{CMakeLists.txt,build.gradle}}`
