## 하네스(Hunspell 1.7.2 CLI) ↔ 앱 네이티브 동작 일치 위험 평가

### 요약
- **엔진 코드는 같다.** `frontend/modules/korean-spell/cpp/hunspell/*.cxx|hxx` 16개 파일 전부가 upstream `v1.7.2` 태그와 **바이트 단위로 동일**하다(md5/cmp 확인). 하네스가 쓰는 `/usr/bin/hunspell`도 1.7.2(`1.7.2+really1.7.2-10build3`)다.
- **유일한 코드 차이는 Debian 패치 1건**인데 이 사전(ko.dic 0.7.94)에는 **효과가 0**이다(아래 (1)).
- **ICONV/OCONV는 CLI가 아니라 라이브러리 안에서 적용된다.** 네이티브는 raw 문자열을 그대로 넘기고, 하네스도 그렇다 → 동일 (아래 (2)).
- **실증:** 이전 하네스가 쓴 어절 1,189개(typos+legit+애칭/연애+헬스)를 시스템 CLI와 *번들 소스를 직접 컴파일한 바이너리*에 넣어 비교 → **known 판정 1,189/1,189 일치, 후보 목록 1,189/1,189 일치, 순서까지 동일.**
- **그런데 실기기에서는 달라진다 — 원인은 알고리즘이 아니라 시간 제한이다.** suggest()는 `clock()` 기반 타임아웃(50ms/100ms/250ms)을 갖고, 이 사전은 후보 계산이 매우 무겁다(데스크톱 x86 -O2에서 **중앙값 77ms**, 660개 중 218개가 ≥100ms, 22개가 ≥250ms). `clock()`은 Linux·bionic·Darwin 모두 **프로세스 전체(모든 스레드) CPU 시간**이라, RN 앱(JS·UI·Hermes 스레드)에서는 하네스보다 먼저 잘린다. 같은 프로세스에 바쁜 스레드를 넣어 재현한 결과 4배 부하에서 후보 목록 21개가 짧아지고 3층 판정 2건이 뒤집혔으며, 8배에서 8건, 16배에서 30건이 뒤집혔다 (아래 (3)).

---

### (1) 번들 Hunspell 버전과 1.7.2 suggest 알고리즘 차이 가능성

| 항목 | 결과 |
|---|---|
| 번들 소스 | `hunspell.cxx`, `suggestmgr.cxx`, `affixmgr.cxx`, `hashmgr.cxx`, `csutil.cxx`, `affentry.cxx`, `filemgr.cxx`, `hunzip.cxx`, `phonet.cxx`, `replist.cxx` + 헤더 6개 — **모두 v1.7.2 태그와 identical**. 1.7.0/1.7.1과는 각 수백~천 줄 차이(1.7.2에서 `suggest_candidate_stack` 재귀 방지 등이 들어감). `docs/SPELLCHECK_NATIVE_ENGINE_REANALYSIS_2026-09-03.md:173`의 "1.7.2 원본" 기술이 정확함. |
| 시스템 CLI | Debian `1.7.2+really1.7.2` — upstream 1.7.2 + Debian 패치. changelog `-4`: "add patch from LibreOffice to allow longer words in hunspell-ko (hunspell#903)". |
| 그 패치의 내용 | `0001-Resolves-rhbz-2158548-allow-longer-words-for-hunspel.patch` (Caolán McNamara, 2023-01-06). 1.7.2가 `HashMgr::add_word`에 넣은 "사전 항목 255바이트 초과 시 거부"(`hentry.blen/clen`이 `unsigned char`) 를 `unsigned short`로 넓힌 것. 한글은 NFD 자모 3바이트×2~3개/음절이라 긴 항목이 걸려 issue #903("1.7.2에서 한국어 검사가 깨짐")이 났음. |
| 이 사전에서의 효과 | `ko.dic` 101,597항목 중 **최장 84바이트**(`조선민주주의인민공화국`), 255바이트 초과 **0개** → 패치 유무와 무관하게 동일하게 로드됨. #903의 재현어 `안녕하세이`도 번들 바이너리에서 `[안녕하세요, 안녕하다]`로 CLI와 동일. 8~50음절 인공어도 양쪽 모두 `#`(후보 없음)으로 동일. |
| 컴파일 옵션 | 앱은 `-O2 -frtti -fexceptions`, `HUNSPELL_STATIC`(android/build.gradle, podspec). 비교 바이너리도 `-O2 -DHUNSPELL_STATIC`로 빌드. 최적화 수준은 결과가 아니라 **속도**에만 영향 → (3)의 시간 제한 문제로 이어짐. |

**결론: 알고리즘 차이 가능성 없음.** 후보 생성 단계(capchars→REP→MAP→swap→longswap→badcharkey→extrachar→forgotchar→movechar→badchar→doubletwochars→twowords→ngram), MAXDIFF 0 처리(`fact=(10-0)/5=2.0`), MAXNGRAMSUGS 4, MAXCPDSUGS 4 해석이 전부 같은 코드다.

참고: 2026-05 릴리스된 **1.7.3**은 suggest 타임아웃을 `clock()`→`std::chrono`(벽시계)로 바꿨고(#716) "입력어를 자기 후보로 내지 않음"(#1058) 등이 들어갔다. 하네스·번들 모두 1.7.2라 지금은 일치하지만, 한쪽만 올리면 (3)의 특성이 갈린다.

### (2) 네이티브의 ICONV/OCONV 적용 — CLI와 같은가

**같다.** 근거:

- `ko.aff`: `SET UTF-8`, `ICONV 11172`(NFC 음절 → NFD 자모, 예 `가`→`가`), `OCONV 11172`(역방향), `REP 59`·`TRY`·`MAP 13`은 전부 자모 단위. `ko.dic`은 NFD로 저장.
- 변환 위치는 **`HunspellImpl` 내부**다: `hunspell.cxx:490`/`1078`(spell/suggest 입구에서 `get_iconvtable()` 적용), `451`/`1030`(출력에 `get_oconvtable()` 적용). CLI 도구(`src/tools/hunspell.cxx` pipe_interface)는 `check()` → `pMS->spell(token)`, `pMS->suggest(chenc(token, io_enc, dic_enc))`만 부르고 `chenc`는 UTF-8→UTF-8이라 항등이다. `TextParser::get_word(tok)`는 `return tok;`(무변형). 하네스(`dict.py`)는 `^어절` 한 줄씩 넣어 토크나이저 개입도 없다.
- 네이티브(`KoreanSpellCore.cpp:56-66`)는 `gHunspell->spell(word)` / `gHunspell->suggest(word)`를 **raw로** 호출. Android JNI(`jni.cpp`)는 `GetStringUTFChars`→`std::string`, 결과는 `NewStringUTF`. iOS(`KoreanSpellBridge.mm`)는 `NSString.UTF8String` ↔ `stringWithUTF8String`. 어느 쪽도 정규화·트림·소문자화를 하지 않는다.
- 사전 로딩: Android는 APK asset을 `filesDir/korean-spell/0.7.94/ko.{aff,dic}`로 원자적(tmp→rename) 추출 후 경로 전달, iOS는 `Bundle.main.path(forResource:"ko")` 경로 전달. 둘 다 Hunspell이 파일을 바이트로 읽고 `SET UTF-8`로 해석 → 하네스가 읽는 `dict/ko.aff`와 같은 바이트.
- `spell("사랑")` 로드 검증(`KoreanSpellCore.cpp:37`)은 ICONV 경로가 살아 있음을 함께 보장한다(NFC 입력이 NFD 사전에 맞는 것 자체가 ICONV 동작).

잔여 위험(작음):
- **JNI modified UTF-8**: 서로게이트 쌍(이모지)은 CESU-8로 넘어가 Hunspell엔 잘못된 UTF-8이지만 `collectTokens`가 한글 음절 외 어절을 미리 버리므로 도달하지 않는다.
- **NFD 입력**: 사용자가 NFD 텍스트를 붙여넣으면 spell은 그대로 통과(사전이 NFD), suggest 출력은 OCONV로 NFC → JS의 UTF-16 편집거리 1 조건에 걸려 **조용히 지적 안 함**(오탐 방향 아님).
- **`DICT_VERSION`(0.7.94) 미갱신**: `dict/`를 갈고 `KoreanSpellModule.kt`의 상수를 안 올리면 안드로이드 기기는 옛 사전을 계속 쓴다 → 하네스(저장소 사전) ≠ 기기. 코드 차이가 아니라 운영 차이지만 불일치의 가장 현실적인 경로다.

### (3) 하네스 결과 중 실기기에서 달라질 수 있는 항목의 종류

**달라지지 않는 것**
- `known`(사전에 있음/없음): `spell()` 경로에는 시간 제한이 없다(`clock()` 호출은 `hunspell.cxx:1101-1219` suggest 구간에만 있음). "헬스·데이트·뽀뽀·커플·맛집은 사전에 있음", "업서·마자가 있음으로 나와 오타를 가림", `stripNasalEnding` 재조회 결과 — 전부 기기에서도 동일.
- 후보의 **상대 순서**: 단계 순서대로 append, ngram은 점수 정렬 → 결정적. 재현 실험에서 "순서만 바뀜"은 0건.

**달라지는 것 — 후보 목록이 뒤에서부터 잘린다**
- 제한 3겹(`atypes.hxx`): `TIMELIMIT` 50ms(checkword 타이머, 100회마다 확인), `TIMELIMIT_SUGGESTION` 100ms(suggest_auto 한 패스), `TIMELIMIT_GLOBAL` 250ms(`HunspellImpl::suggest` 전체). 걸리면 그 시점까지 모인 후보를 그대로 돌려준다.
- 이 사전은 SFX 98,577개·COMPOUNDRULE 14개라 후보 계산이 무겁다: x86 -O2 기준 660 어절 suggest **중앙값 77ms, ≥100ms 218개, ≥250ms 22개**(`먹을거같아` 337ms, `늦을것같아` 314ms 등). 즉 **하네스 자체도 이미 무거운 어절에서는 잘린 결과**를 내고 있다(유휴 상태 2회 실행은 서로 일치했으나, 부하 아래에서 돌리면 하네스 결과도 흔들린다).
- `clock()`은 프로세스 CPU 시간(모든 스레드 합) → 앱에서는 JS/UI/GC 스레드가 시계를 앞당긴다. 같은 프로세스에 busy 스레드를 넣어 재현(`scratchpad/bundled/main_busy.cpp`, 결과 `runs.json`):

| 부하(≈시계 배속) | 후보 목록 짧아짐 | 띄어쓰기 변형 전부 소실 | 3층 판정 뒤집힘(현행/제안안 합산) |
|---|---|---|---|
| 2배 | 3/660 | 0 | 0 |
| 4배 | 21 | 1 | **2** — `보고싶었어` 3후보→2후보로 `보고시었어` 오탐 발생(현행), `운동가야지`→`운동가이지` |
| 8배 | 67 | 1 | **8** — `보고싶네`→`보고시네`, `보고싶어요`→`보고시어요` 오탐 신규; `보고싶었어`는 **제안안에서도** 뒤집힘; 반대로 `닭가슴살`·`놀고있어`·`언제만나`는 유일 후보가 사라져 오탐이 *없어짐* |
| 16배 | 131 | 43 | **30** — `잘먹었어`→`잘라먹었어`(제안안), `커플사진`→`커플까진`(제안안), `잘잤어`→`잘났어`, `뭐먹을래`→`물먹을래` 등 |

**종류별 정리**
1. **후보 개수**: 가장 흔함. 잘리는 순서는 ngram(마지막) → twowords 띄어쓰기 변형 → 편집 단계 후보. 제안안의 두 신호("후보 여럿"=주로 ngram이 채움, "띄어쓰기 변형 있음"=twowords)가 **정확히 먼저 잘리는 부분**이라, 하네스에서 15→8로 줄어든 오탐 중 일부가 기기에서 되살아난다. `보고싶었어`가 실측 예.
2. **후보 순서**: 진짜 재배열은 없음. 단 극단 부하에서는 잘린 패스 뒤에 다른 cpdsuggest 패스 결과가 앉아 하네스에 없던 후보가 나타날 수 있다(`잘먹었어`→`['잘라먹었어']`).
3. **띄어쓰기 변형 포함 여부**: 4~8배에선 대체로 살아남고(twowords가 ngram보다 앞), 16배에서 대량 소실. 중저가 안드로이드 + 채팅 화면 애니메이션/키 입력 중 호출이면 4~8배 구간이 현실적이다.
4. **빈 배열화**: ≥250ms 어절(`먹을거같아`, `늦을것같아`, `단백질쉐이크`)은 기기에서 `[]`가 되기 쉽다 → 3층이 아무 말도 안 함(안전 방향).
5. **동일 기기에서도 비결정적**: 부하에 따라 같은 어절이 다른 판정을 받을 수 있다 — "어제는 안 그랬는데" 류 제보가 여기서 나온다.

방향성: 후보가 줄면 (a) 유일 편집거리-1 후보가 사라져 오탐이 없어지는 경우와 (b) 포기 신호(ngram·띄어쓰기 변형)가 사라져 오탐이 생기는 경우가 섞이며, 실측에서는 (b)가 더 많았다. **하네스는 최선 조건(유휴 단일 스레드 x86)이라 오탐 상한이 아니라 하한을 측정한다.**

### (4) 실기기 검증 절차 — 하네스 일치를 확정하는 어절 10개

**방법**: 3층 판정이 아니라 **raw `KoreanSpell.suggest(word)` 배열과 소요 ms**를 비교해야 한다(판정만 보면 시간 제한 잘림과 엔진 차이를 못 가른다). 개발 메뉴나 `__DEV__` 로그로 `spellMany([w])`·`suggest(w)`·`Date.now()` 차를 찍고, `python3 scratchpad/spell/dict.py suggest <어절…>` 출력과 **개수·순서까지** 대조한다. release 빌드로, ① 화면 정지 상태 ② 채팅 목록 스크롤/애니메이션 중 두 번, 지원 기기 중 가장 느린 것에서 돈다.

| # | 어절 | 하네스 기대값 | 무엇을 확정하나 |
|---|---|---|---|
| 1 | `사랑` | known=true | 로드·ICONV 경로 살아 있음(`load()` 검증과 동일) |
| 2 | `업서` | known=true | 사전 파일 동일성(동형이의 가림 재현), spell 경로 |
| 3 | `뭐했어용` | 지적 없음(`뭐했어`로 재조회 통과) | `stripNasalEnding`+spellMany 배선 |
| 4 | `안녕하세이` | `[안녕하세요, 안녕하다]` | #903 카나리(255바이트 가드 무영향), OCONV 출력이 NFC(길이 5) |
| 5 | `제작년` | `[재작년]` → 지적 | 정탐 양성 대조(REP 경로), 유일 후보 |
| 6 | `귀찬아` | 후보에 `귀찮아`·`귀잖아` 둘 다 → `귀찮아` | 자모 동점 해소가 두 후보 모두 있어야 성립 |
| 7 | `실타` | 1위 `싫다`, 3층은 거부 | 후보 순서 일치(MAXDIFF 0·거리 2 거부) |
| 8 | `보고싶어` | `[보고시어, 보고 싶어, 보고서]` | 핵심 오탐 재현 + 띄어쓰기 변형 + ngram 꼬리(3번째) 존재 |
| 9 | `보고싶었어` | `[보고시었어, 보고 싶었어, 보고되었어]` | **시간 제한 카나리** — 2개만 오면 4배 이상 잘리는 기기 |
| 10 | `먹을거같아` | `[먹을거리]`(하네스 337ms) | 250ms 글로벌 컷 — 기기에서 `[]`면 하네스보다 얼마나 느린지 척도; ms 값 기록 |

**판독**: #1~#7이 다르면 엔진/사전 불일치(→ `DICT_VERSION`·asset 추출·번들 리소스 확인). #8~#10만 꼬리가 짧으면 시간 제한이며, 그 기기에선 하네스의 "15→8" 개선분 중 `보고싶었어`류가 되살아난다고 봐야 한다. 추가로 `잘먹었어`(`[잘 먹었어, 자먹었어]`)와 `이번거`(`[이번 거, 이번과, 이번서]`)는 제안안의 "띄어쓰기 변형 → 포기" 신호가 기기에서 살아남는지 직접 보여준다.

**하네스 쪽 보강 제안(저장소 수정 없이 가능)**: `dict.py`가 어절별 suggest 소요 ms를 함께 기록하고 ≥100ms인 어절은 "timing-fragile"로 표시해, 그 어절의 3층 판정은 기기 실측 없이는 신뢰하지 않는다. 장기적으로는 3층이 "포기 신호의 부재"를 확신으로 해석하지 않도록(후보 2개 이하일 때 ngram이 잘렸을 가능성을 감안) 설계하거나, 1.7.3의 chrono 타임아웃/`SPELL_BEST_SUG`로 올릴 때 하네스와 번들을 **동시에** 올린다.

### 산출물(스크래치, 저장소 밖)
- 번들 소스 컴파일 바이너리·비교 스크립트: `/tmp/claude-0/-home-user-Doubly/52eaab22-383c-57a7-9aff-76ab32db2639/scratchpad/bundled/{main.cpp,main_busy.cpp,bundled_hs,busy_hs,eval.mjs,runs.json}`
- upstream 1.7.0/1.7.1/1.7.2/master 소스·LibreOffice 패치: `/tmp/claude-0/-home-user-Doubly/52eaab22-383c-57a7-9aff-76ab32db2639/scratchpad/up/{1.7.0,1.7.1,1.7.2,master,tools,lo.patch}`
- 읽은 저장소 파일: `frontend/modules/korean-spell/cpp/KoreanSpellCore.cpp`, `cpp/hunspell/*`, `android/src/main/cpp/jni.cpp`, `android/src/main/java/expo/modules/koreanspell/{HunspellNative,KoreanSpellModule}.kt`, `ios/{KoreanSpellBridge.h,KoreanSpellBridge.mm,KoreanSpellModule.swift}`, `KoreanSpell.podspec`, `android/{CMakeLists.txt,build.gradle}`, `src/KoreanSpellModule.ts`, `dict/ko.aff`, `frontend/src/utils/{koreanDictionary,koreanDictionaryRules}.ts`

Sources: [Getting hunspell 1.7.2 into unstable (debian-l10n-korean)](https://www.mail-archive.com/debian-l10n-korean@lists.debian.org/msg00762.html), [hunspell/NEWS at master](https://github.com/hunspell/hunspell/blob/master/NEWS), [Release v1.7.2 · hunspell/hunspell](https://github.com/hunspell/hunspell/releases/tag/v1.7.2), [hunspell issue #903](https://github.com/hunspell/hunspell/issues/903), [LibreOffice patch 0001-Resolves-rhbz-2158548-allow-longer-words-for-hunspel.patch (libreoffice-7-5)](https://raw.githubusercontent.com/LibreOffice/core/libreoffice-7-5/external/hunspell/0001-Resolves-rhbz-2158548-allow-longer-words-for-hunspel.patch)