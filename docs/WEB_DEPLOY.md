# 웹 배포 가이드 (1단계 — 빠른 공유)

Expo 앱을 **정적 웹사이트로 빌드**해서 배포하면, 커플이 **폰 브라우저에서 URL로 바로** 쓸 수 있고
"홈 화면에 추가"하면 앱처럼 동작합니다. (앱스토어·Expo Go·빌드 불필요)

> 백엔드는 이미 Railway에 배포돼 있습니다(`config.ts`가 그 주소를 봄).
>
> ⚠️ **CORS 필수 설정**: 운영(prod) 백엔드는 `CORS_ALLOWED_ORIGINS` 가 비어 있으면
> **브라우저 요청을 전부 차단**합니다(네이티브 앱은 무관). 웹 주소가 정해지면 Railway
> 백엔드 서비스 Variables 에 추가하세요 (쉼표 구분, 예:
> `CORS_ALLOWED_ORIGINS=https://doubly.netlify.app`). 저장하면 자동 재배포됩니다.

## 1. 웹 의존성 설치 (최초 1회)

`frontend` 폴더에서 (정상 인터넷 PC에서):

```bash
npx expo install react-dom react-native-web @expo/metro-runtime
```

## 2. 웹 빌드

```bash
npm run build:web
```

→ `frontend/dist/` 폴더에 정적 파일이 생성됩니다 (이게 배포할 결과물).

## 3. 배포 — 둘 중 편한 방법

### 방법 A: Netlify Drop (가장 쉬움, 드래그&드롭)

1. https://app.netlify.com/drop 접속
2. 방금 만든 **`frontend/dist` 폴더를 통째로 드래그&드롭**
3. 잠시 후 `https://<랜덤이름>.netlify.app` 주소 생성 → 끝!

### 방법 B: Vercel / Cloudflare Pages (GitHub 연동, 자동 재배포)

- 새 프로젝트 → `Dong-yeon/fitto` 연결
- **Root Directory**: `frontend`
- **Build Command**: `npm run build:web`
- **Output Directory**: `dist`
- 배포 후 push 할 때마다 자동 갱신

> ⚠️ SPA 라우팅: 새로고침 시 404가 나면, 호스트의 "리다이렉트 → index.html"(SPA fallback)을 켜세요.
> Netlify는 `dist/_redirects` 파일에 `/* /index.html 200` 한 줄로 됩니다. (Drop 방식이면 빌드 후 추가)

## 4. 폰에서 "홈 화면에 추가" (앱처럼)

- **아이폰(Safari)**: 주소 열기 → 공유 버튼 → **홈 화면에 추가**
- **안드로이드(Chrome)**: 주소 열기 → 메뉴(⋮) → **앱 설치 / 홈 화면에 추가**

→ 홈 화면 아이콘으로 실행하면 브라우저 주소창 없이 앱처럼 떠요.

## 5. 동작 확인

배포된 주소에서:
1. 회원가입 → 홈 진입
2. 커플 연결(계정 2개) → 운동 기록 → 스트릭
3. 채팅 실시간 송수신

---

## 참고 / 한계
- **iOS 웹 푸시**는 제한적입니다(설치형 PWA에서 일부 지원). 본격 푸시 알림은 2단계(EAS Build 네이티브 앱)에서.
- 카메라·보안저장 등 네이티브 기능도 네이티브 앱에서 더 매끄럽습니다.
- 지금 단계 기능(인증·커플·운동·채팅·스트릭)은 웹에서 모두 동작합니다.

## 다음 단계 (2단계 — 앱스토어)
실사용 피드백이 모이면 **EAS Build**로 iOS/Android 네이티브 앱을 만들어 스토어에 올립니다
(Windows에서도 클라우드 빌드 가능). 그때 별도 가이드를 추가하겠습니다.
