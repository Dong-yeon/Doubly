# 맞춤법 검사기 — 사전 기반 엔진 도입 분석 (2026-09-02)

> 계기: 채팅 맞춤법 검사기(`koreanSpellRules.ts`, 규칙 기반 ~90개 쌍)가 현재 어떻게
> 동작하는지 분석하다가, 사용자가 "국어사전 DB를 넣어서 모든 케이스를 검사하고 싶다"는
> 질문을 던졌다. 그 방향을 실제로 조사·프로토타입까지 진행했다.

## 0. 결론 먼저

**사전 기반 엔진(Hunspell)으로 방향을 트는 것 자체는 유효하다** — 지금 손으로 고른 90개
규칙을 거의 그대로 자동 재현하고 그 이상으로 일반화된다. 다만 **RN 앱에 실제로 통합하는
길에서 막혔다** — 이 프로젝트의 Hermes 빌드에 `WebAssembly` 전역이 없다. 진행하려면
엔진(JSC 전환 등) 또는 접근 방식(WASM 대신 순수 JS) 자체를 바꾸는 결정이 필요하다.

## 1. 후보 비교

### 1-1. Kiwi (형태소 분석기) — 기각

- npm `kiwi-nlp`(WASM 바인딩) + 공식 모델(`kiwi_model_v0.23.0_base.tgz`).
- **용량**: WASM 3.6MB + 모델 압축 83MB, 압축 해제 시 **약 109MB**. 앱이 마케팅 예산
  없는 인디 앱이라 이 정도 증가는 설치 이탈로 직결될 위험이 큼.
- **라이선스**: LGPL-2.1 — 네이티브 코드 정적 링킹이라 앱스토어 배포 시 컴플라이언스가
  애매함(재링크 가능성 요건).
- **테스트 결과**(Node.js): 자체 typo 사전이 "왠일로"·"갈께"·"오랫만에"·"어의없어" 등
  우리 규칙표의 기존 항목을 **놓쳤다**(사전 자체가 다른 목적으로 큐레이션돼 있어서).
  대신 우리 규칙표에 없는 "재밋었어→재밌었어"는 잡았다 — 즉 겹치지 않는 두 소스라
  Kiwi 하나로 대체가 안 됨, "다르다/틀리다" 같은 문맥 의존 케이스도 못 잡음(원래
  설계가 이런 걸 일부러 뺀 이유가 맞았다는 뜻이기도 함).

### 1-2. Hunspell + hunspell-dict-ko — 채택

- **엔진**: `hunspell-asm`(진짜 Hunspell C++ 코어를 WASM으로 컴파일).
  - `nspell`(순수 JS 재구현체)도 시도했으나 한국어 사전을 제대로 못 읽어(`asdkjaslkdj`
    같은 무작위 영문도 "정상"으로 판정) 실사용 불가 — 원인 미조사, 재조사 필요 항목으로
    남김(§4 참고).
- **사전**: `spellcheck-ko/hunspell-dict-ko`(국립국어원 데이터 기반, LibreOffice·
  Firefox 한국어 맞춤법 검사기에 실제 쓰임).
  - 배포 zip은 876KB(압축)지만 **압축 해제하면 ko.aff 11.1MB + ko.dic 2.86MB ≈ 14MB**
    — 처음 "876KB"로 판단했던 건 압축 크기와 실제 크기를 혼동한 실수였다(2026-09-02
    세션 중 스스로 정정).
- **라이선스**: GPL-3.0(사전 데이터). 저장소 LICENSE.md 가 명시적으로 "실행 프로그램과
  hunspell 사전은 별개 저작물이라 라이선스가 호환될 필요 없다"고 밝혀둠(OpenOffice
  판례 인용) — Kiwi의 LGPL 네이티브 링킹보다 훨씬 명확한 입장.
- **테스트 결과**(Node.js, 실제 Hunspell WASM 엔진):
  - 우리 규칙표의 기존 오류 5개(안되요·오랫만에·어의없어·갈께·왠일로) **전부 자동으로
    잡고, 제안까지 우리 규칙표와 거의 동일**하게 나옴.
  - 정상 문장(안돼·왠지·오랜만이야·특이해)은 통과 — 오탐 없음.
  - **애교체(커플 채팅 실사용 맥락)에서 오탐 발생**: "뭐했어용", "사랑행", "배고파용",
    "먹었뎌" 등을 전부 "사전에 없다"고 판정. 사전 하나로 못 잡는 생산적 패턴이라
    단어를 하나씩 등록하는 방식은 무한 확장이라 안 됨.
  - **패턴 기반 해결책 검증 완료**: 애교체 콧소리(마지막 글자에 ㅇ받침을 붙이는 규칙적
    변형 — 요→용, 해→행)를 감지해 받침만 벗기고 재검사하면, 7개 테스트 중 6개가 단어
    등록 없이 규칙 하나로 정상 처리됨(`koreanSpellCheck.ts`의 `endsWithRieul`와 같은
    한글 자모 분해 방식이라 코드 스타일도 맞음). "먹었뎌"류(모음 교체형)는 이 패턴 밖이라
    별도 소수 예외 목록이 필요.
  - **권장 아키텍처**: 기존 정규식 엔진(`koreanSpellRules.ts`)은 그대로 두고(이미
    검증됐고 친절한 한국어 설명이 붙어있음), Hunspell을 **두 번째 독립 소스**로 얹어
    정규식이 못 잡은 자리만 보완한다. Hunspell 단독 결과는 자연어 설명(`reason`)이
    없으므로 일반화된 문구로 채운다.

## 2. RN/Expo 통합 시도 — WebAssembly 벽에서 중단

실기기(Android, dev-client, Expo SDK 56 / react-native 0.85.3)에 순서대로 세 가지
크래시를 만났다. 코드는 `frontend/src/utils/hunspell/hunspellEngine.ts` +
`frontend/metro.config.js`에 프로토타입으로 남아있다(2026-09-02 커밋, main 병합됨).

1. **nanoid 크래시** — `hunspell-asm`과 그 의존성 `emscripten-wasm-loader`가 각자
   내장한 `nanoid@2`가 RN 환경이기만 하면(`navigator.product === 'ReactNative'`)
   `crypto` 폴리필 유무와 무관하게 무조건 "secure random generator 없음"을 던진다.
   → `metro.config.js`에서 두 패키지 트리 안의 `nanoid` 요청만
   `nanoid/non-secure`(순수 `Math.random`)로 리다이렉트해 해결. 이 id는 WASM 가상
   파일시스템의 임시 마운트 경로 이름일 뿐이라 보안 랜덤일 이유가 없었다.
2. **document 크래시** — Emscripten 글루코드가 `typeof window === "object"`로
   "브라우저다"라고 판단하는데(RN 은 `window`를 `global`의 별칭으로 두어서 이 판단이
   `true`가 된다), 정작 `document`는 RN 에 없어서 `document.currentScript` 접근에서
   죽는다. → `global.document = {}` 빈 스텁으로 해결(falsy 값이라 자연스럽게 다음
   분기로 넘어감).
3. **WebAssembly 부재 — 못 넘음**. 사전 조사에서 "react-native 0.84+ 가 Hermes 에
   WebAssembly 지원을 추가했다"고 확인했었는데, 이론상 지원과 이 Expo SDK 56
   dev-client 빌드에 실제로 켜져 있는지는 별개였다. 네이티브 엔진 기능이라 JS/Metro
   레벨 우회가 불가능하다.

## 3. 남은 선택지 (우선순위 미정 — 다음 세션에서 재우선순위)

1. **JSC(JavaScriptCore) 엔진 전환**: WASM 은 되지만 앱 전체 성능·번들·디버깅 도구
   호환성에 영향을 주는 훨씬 큰 결정 — 스펠체커 하나 때문에 결정할 사안이 아니다.
2. **Hermes 를 WASM 활성화 옵션으로 재빌드 가능한지 확인**: 이 SDK/RN 조합에서 실제로
   가능한지부터 조사가 필요하고, 가능해도 네이티브 재빌드가 필요해 시간이 걸린다.
3. **WASM 포기, nspell(순수 JS) 로 회귀**: §1-2에서 nspell 이 한국어 사전을 제대로
   못 읽던 원인을 아직 못 밝혔다 — 재조사해서 고칠 수 있으면 가장 가벼운 경로가 된다
   (WASM/네이티브 이슈 자체가 사라짐).

## 4. 남겨진 프로토타입 코드 상태

- `frontend/src/utils/hunspell/hunspellEngine.ts` — `getHunspell()` 하나만 있고
  아직 `checkKoreanSpelling` 에는 연결 안 됨(로드 자체 검증용).
- `frontend/src/utils/hunspell/koDictionaryData.ts` — hunspell-dict-ko 0.7.94 원본을
  base64 그대로 인라인(비압축 약 14MB) — 실제 반영 전에 gzip 압축 등 용량 최적화 필요.
- `frontend/src/screens/my/SettingsScreen.tsx` — "(개발용) Hunspell 테스트" 행이
  `맞춤법 제안` 카드 안에 그대로 노출돼 있다(TEMP-PROTOTYPE 주석 있음) — 실사용자에게
  보이는 상태이니 다음에 이 작업을 재개하거나 폐기할 때 같이 정리할 것.
