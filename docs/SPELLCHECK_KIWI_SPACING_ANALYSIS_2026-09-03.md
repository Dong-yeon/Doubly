# 띄어쓰기 교정 — Kiwi 도입 조사 (2026-09-03)

> 맞춤법 검사 1·2·3층([SPELLCHECK_NATIVE_ENGINE_REANALYSIS_2026-09-03.md](./SPELLCHECK_NATIVE_ENGINE_REANALYSIS_2026-09-03.md))을
> 끝낸 뒤, Hunspell 이 원리적으로 못 하는 **띄어쓰기 교정**을 Kiwi 로 붙일 수 있는지
> 조사했다. 실기기 측정까지 끝냈고, 남은 건 배포 방식 결정뿐이다.

## 0. 적용 범위 — 채팅에는 넣지 않는다

커플 채팅에서는 "오늘 시간돼?" 처럼 붙여 쓰는 게 말투다. 그래서 규칙 엔진도 채팅체
띄어쓰기는 일부러 안 건드리고, `scripts/verify-spellcheck.mjs` 의 오탐 방지 케이스에
그 결정이 박혀 있다:

```js
'오늘 시간돼?', // 붙여 쓴 채팅체 — 띄어쓰기는 지적하지 않는다
```

띄어쓰기 교정을 채팅에 넣으면 이 결정과 정면으로 충돌한다. **럽슐랭 리뷰·일기처럼
문장을 쓰는 화면에만** 붙인다(사용자 확인, 2026-09-03).

## 1. 공식 안드로이드 릴리스로는 도달할 수 없다

가장 먼저 확인해야 했던 것이고, 여기서 한 번 막혔다.

| 확인 | 결과 |
| --- | --- |
| C API `kiwi_space()` | **있음** (`include/kiwi/capi.h:772`) |
| 공식 AAR(v0.23.2)의 Java 바인딩에 `space()` | **없음** — 미출시 `main` 브랜치에만 있다 |
| AAR 의 `libKiwiJava.so` 가 C API 노출? | **아니오.** `kiwi_*` 심볼 0개. `JNI_OnLoad` 로 등록한 JNI 표면뿐 |
| `Token.wordPosition` 으로 우회? | **불가.** `getWordPositions()` 가 **입력 문자열의 공백**으로 어절 번호를 매겨 토큰에 붙인다 — 그룹핑해봐야 입력의 기존 띄어쓰기가 재현될 뿐이다 |

즉 **소스에서 직접 빌드하는 것 외에 길이 없다.** (`tokenize()` 결과에 품사 규칙을 얹어
직접 구현하는 방법도 있지만, `kiwi_space` 는 언어모델 점수까지 쓰므로 품질이 떨어진다.)

## 2. 소스 빌드 — 된다

`third_party` 서브모듈 8개 중 **4개만 있으면 된다**(mimalloc·cpuinfo 는 CMake 옵션으로
끌 수 있고, tclap·googletest 는 CLI·테스트용). 다만 **cpuinfo 는 켜야 한다** — 끄면
`ArchType::none` 으로 떨어져 양자화가 비활성화되고 메모리가 훨씬 커진다(§3).

```
-DKIWI_USE_MIMALLOC=OFF -DKIWI_USE_CPUINFO=ON
-DKIWI_BUILD_CLI=OFF -DKIWI_BUILD_EVALUATOR=OFF
-DKIWI_BUILD_MODEL_BUILDER=OFF -DKIWI_BUILD_TEST=OFF
-DKIWI_BUILD_DYNAMIC=ON -DCMAKE_SHARED_LINKER_FLAGS="-llog"
```

마지막 `-llog` 가 필요하다 — cpuinfo 가 `__android_log_vprint` 를 쓰는데 CMake 가
안드로이드 로그 라이브러리를 자동으로 걸어주지 않아 링크가 깨진다.

결과: **`libkiwi.so` 스트립 후 17.3MB**(arm64-v8a). `kiwi_space`·`kiwi_init`·
`kiwi_free_string` 전부 정상 노출.

## 3. 실기기 측정 (arm64, 10A30Q)

### 3-1. 옵션·모델 구성이 비용을 좌우한다

`kiwi_init` 의 `options` 와 모델 디렉토리 구성만 바꿔도 차이가 크다.

| 구성 | 디스크 | 로드 | RSS | 띄어쓰기 품질 |
| --- | --- | --- | --- | --- |
| 전체 모델 + `KIWI_BUILD_DEFAULT`(15) | 105MB | 6209ms | 413MB | 기준 |
| 전체 모델 + `options=7`(multi.dict 제외) | 105MB | 3347ms | 258MB | 동일 |
| **최소 모델 + `options=7`** | **83.3MB** | **3227ms** | **241MB** | **동일** |
| 최소 모델 + `options=1`(사전 없음) | 83.3MB | 2395ms | 202MB | 동일(샘플 기준) |

**`multi.dict`(11.7MB)를 안 읽는 것만으로 로드가 절반, 메모리가 155MB 줄어든다.**

모델 파일별로 하나씩 빼며 확인한 결과(누적이 아니라 독립적으로):

- **뺄 수 있음**: `multi.dict`(11.7MB), `nounchr.mdl`(9.7MB), `dialect.dict`
- **필수**: `cong.mdl`(72.2MB), `sj.morph`(8.1MB), `default.dict`(3.1MB),
  `extract.mdl`(17KB), `typo.dict`, `combiningRule.txt`

→ 최소 구성 **83.3MB**(원본 105MB 대비 21MB 감소).

### 3-2. 품질 — 핵심은 잘 되고, 수 표현이 문제다

`reset_whitespace=1` 기준(0 은 잘못 띄어진 걸 못 고친다):

```
✅ 오늘여기서파스타를먹었는데정말맛있었다 → 오늘 여기서 파스타를 먹었는데 정말 맛있었다
✅ 분위기가너무좋아서다음에또오고싶다     → 분위기가 너무 좋아서 다음에 또 오고 싶다
✅ 비오는날에는뜨끈한국물이최고다         → 비 오는 날에는 뜨끈한 국물이 최고다   ('한국물' 함정 통과)
✅ 가격대비 만 족스러웠고 직원분들 도     → 가격 대비 만족스러웠고 직원 분들도    (잘못 띄운 것 교정)
✅ 이 집 김치찌개는 진짜 인정             → 그대로                              (오탐 없음)
❌ 오늘로 우리 천일이야 축하해            → 오늘로 우리 천 일이야 축하해
❌ 벌써 삼백일이 넘었다                   → 벌써 삼백 일이 넘었다
△ 사장님이 챙겨주셔서 기분좋게           → 챙겨 주셔서 기분 좋게               (맞춤법상 맞지만 현학적)
```

**수 표현이 커플 앱에서는 그냥 넘길 수 없는 오류다** — "천일·삼백일"은 이 앱의 핵심
개념이다. 다만 `kiwi_builder_add_word()` / `kiwi_builder_load_dict()` 로 사용자 사전을
넣을 수 있으므로(API 확인 완료), `kiwi_init` 대신 builder 흐름을 쓰면 보정 가능하다.

교정 자체는 문장당 **1ms 내외**로 빠르다 — 비용은 전부 로딩에 있다.

### 3-3. 라이선스 정정

README 에는 LGPL v3 이라고 적혀 있지만 **실제 LICENSE 파일은 LGPL 2.1 or later** 다.
앱스토어 배포에서 문제가 되는 v3 의 anti-tivoization 조항이 없어 조건이 더 낫다.
`.so` 로 동적 링킹하므로 재링크 요건도 자연히 충족된다 — **정적으로 묶지 말 것.**

## 4. 구현 (2026-09-03, 같은 날 완료)

조사 결과대로 **소스 빌드 + 앱 번들**로 구현했다(모델 배포 방식은 사용자 결정).

### 4-1. 모델을 꺼내지 않는다 — APK asset 을 그 자리에서 읽는다

`kiwi_builder_init_stream` 이 "파일명을 주면 읽기/이동/닫기를 제공하는 스트림"을 받으므로
Android `AAssetManager` 에 그대로 연결했다. 꺼내 썼다면 **APK 83MB + 내부저장소 83MB 로
사용자 저장소를 두 배** 잡아먹는다(Hunspell 사전 14MB 는 이 방식이 없어 꺼낸다).

대신 `build.gradle` 에 `noCompress` 를 지정해야 한다 — 압축된 asset 은 seek 마다 앞에서부터
다시 풀어서 로딩이 몇 배로 느려진다. 어차피 모델은 이미 압축된 바이너리라 압축해도
거의 안 줄어든다(105MB → 88MB).

### 4-2. 구조

```
modules/korean-spell/
  android/src/main/jniLibs/arm64-v8a/libkiwi.so   직접 빌드(17.3MB), LGPL 2.1 동적 링킹
  android/src/main/cpp/kiwi_jni.cpp               AAssetManager 스트림 + JNI
  android/src/main/java/.../KiwiNative.kt         C++ 진입점
  cpp/kiwi/{capi.h,Macro.h}                       JNI 컴파일용 헤더만
  kiwi-model/kiwi/                                최소 모델 83.3MB
src/utils/koreanSpacing.ts                        JS 쪽 얇은 감싸개
src/hooks/useSpacingFix.ts                        모델 수명 + 되돌리기
src/components/SpacingFixBar.tsx                  준비중/정리/되돌리기 세 상태
```

`options=7` 을 코드에 박았다(§3-1 근거). 64비트 ABI 에만 Kiwi 를 넣고 CMake 가 조건부로
처리한다 — 없는 ABI 에서는 Kotlin 이 `UnsatisfiedLinkError` 를 받아 조용히 기능만 끄고,
맞춤법 검사(Hunspell)는 모든 ABI 에서 그대로 동작한다.

### 4-3. 자동 적용하지 않는다

§3-2 에서 본 '천일→천 일'·'챙겨주셔서→챙겨 주셔서' 는 **맞춤법상 Kiwi 가 맞다**(단위명사는
띄어 쓰는 게 원칙). 문제는 정확성이 아니라 사용자가 원치 않는 변경이라는 점이다. 그래서
사용자 사전으로 억지로 막는 대신 **눌러야 바뀌고 되돌릴 수 있게** 했다 — 맞춤법 검사줄과
같은 원칙이다("고쳐주지 않고 물어본다").

모델은 화면에 들어올 때 미리 올리고 **나갈 때 반드시 내린다**(`useFocusEffect`). 안 내리면
채팅으로 돌아간 뒤에도 240MB 를 붙들고 있다.

### 4-4. 실기기 검증

```
loadSpacing 4168ms  loaded=true          (standalone 3227ms + asset 스트림 오버헤드)
오늘여기서파스타를먹었는데정말맛있었다 → 오늘 여기서 파스타를 먹었는데 정말 맛있었다  (7ms)
비오는날에는뜨끈한국물이최고다         → 비 오는 날에는 뜨끈한 국물이 최고다        (6ms)
가격대비 만 족스러웠고 직원분들 도     → 가격 대비 만족스러웠고 직원 분들도          (6ms)
이 집 김치찌개는 진짜 인정             → 그대로                                    (5ms)
unloaded=true                                                    (메모리 반납 확인)
```

가는 길에 실기기에서만 드러나는 버그가 하나 있었다: `KiwiNative` 에 `System.loadLibrary`
가 없었다. Hunspell 쪽이 부른다고 봤는데, **글 쓰는 화면은 맞춤법 검사를 안 쓰므로
`HunspellNative` 를 한 번도 안 건드린 채 띄어쓰기부터 쓰는 경로가 실제 사용 경로**다.
빌드도 통과하고 심볼도 다 있고 APK 에도 다 들어갔는데 호출 순서 때문에 죽었다.

## 5. 남은 것

- **x86_64 라이브러리** — 에뮬레이터용. arm64 만 먼저 넣었다.
- **iOS** — 공식 `Kiwi.xcframework`(36.8MB)가 배포돼 있어 경로는 있지만 맥이 없어 못 했다.
  현재 iOS 에서는 `loadSpacing` 이 실패하고 기능만 조용히 빠진다.
- **사용자 사전** — `kiwi_builder_add_word` 를 부를 자리는 만들어 뒀다(builder 흐름).
  실사용에서 특정 표현이 계속 거슬리면 그때 넣는다.

## 6. 참고 — 모델 배포 방식 (결정: 앱 번들)

Play 는 설치 크기(base APK + config APK)를 **150MB** 로 제한한다. 현재 앱에 83MB 를
그대로 얹으면 다운로드가 크게 늘고 여유가 줄어든다.

- **번들** — 단순하다. 대신 모든 사용자가 안 쓰는 기능의 83MB 를 내려받는다.
- **처음 쓸 때 내려받기** — 기능이 리뷰·일기 화면 한정이라 궁합이 좋다. 안 쓰는
  사용자는 비용이 0이고 Play 상한 문제도 사라진다. 대신 호스팅과 다운로드 UX 가 필요하다.

네이티브 모듈 API 는 **모델 경로를 인자로 받게** 설계해 뒀으므로 어느 쪽이든 코드는
그대로다.

메모리 241MB 도 정책이 필요하다. 리뷰·일기 화면에 들어올 때 올리고 나갈 때 내리면
(로드 3.2초는 백그라운드에서 감춘다) 상주 비용은 그 화면에서만 발생한다.

## 5. 재현 방법

조사에 쓴 산출물은 저장소에 남기지 않았다(모델 105MB, 빌드 트리 수 GB). 재현하려면:

1. `git clone https://github.com/bab2min/Kiwi` 후 `third_party/{cpp-btree,eigen,streamvbyte,json,cpuinfo}` 서브모듈 init
   (모델은 저장소에 git-lfs 로 들어있어 clone 시 같이 받아진다 — `models/cong/base`)
2. §2 의 CMake 옵션으로 NDK 툴체인 빌드 → `libkiwi.so`
3. `llvm-strip --strip-unneeded` → 17.3MB
4. 모델과 함께 `adb push` 후 `LD_LIBRARY_PATH` 를 걸고 실행

RN·JSI 를 끼우지 않고 C API 만 standalone 바이너리로 재는 방식이 여기서도 유효했다
(Hunspell 때와 같은 방법). 앱 빌드 없이 "빌드되는가 / 품질이 쓸 만한가 / 비용이
얼마인가"를 전부 답할 수 있다.
