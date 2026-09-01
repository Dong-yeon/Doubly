# dubly.co.kr 소개 사이트 (`landing/`)

App Store Connect·Play Console 에 제출하는 **개인정보처리방침 / 지원 / 마케팅 URL** 을 제공하는
정적 사이트. 앱(Expo 웹 빌드)과는 **별개 사이트**다.

## 왜 `frontend/public/` 이 아니라 별도 폴더인가

처음에는 `privacy.html` 이 `frontend/public/` 에 있었다(커밋 `e2edba2`). Expo 웹 빌드가
`public/` 을 `dist/` 로 복사해 주므로 앱 사이트에 얹혀 갈 수 있었기 때문이다.

그런데 루트에 소개 페이지(`index.html`)를 두려는 순간 충돌이 생긴다 — Expo 웹 빌드도
`dist/index.html` 을 만들기 때문에 **같은 자리를 두 파일이 다툰다**. 어느 쪽이 이기든
빌드마다 결과가 달라질 수 있어 안전하지 않다.

그래서 소개·법적 고지 페이지 전체를 `landing/` 으로 옮겼다. 앱은 앱대로,
소개 사이트는 소개 사이트대로 각각 Netlify 사이트 하나씩 쓴다.

## 구성

```
landing/
  index.html     소개 페이지 (마케팅 URL)
  privacy.html   개인정보처리방침  ← legal.ts 의 PRIVACY_POLICY 와 같은 내용
  terms.html     이용약관          ← legal.ts 의 TERMS_OF_SERVICE 와 같은 내용
  support.html   지원 · FAQ
  _redirects     확장자 없는 주소로 재작성
  icon.png       frontend/assets/icon.png 사본
```

> ⚠️ `privacy.html`·`terms.html` 본문은 `frontend/src/constants/legal.ts` 와 **손으로 맞춘
> 사본**이다. 약관을 개정해 `TERMS_VERSION`/`PRIVACY_VERSION` 을 올릴 때 이 파일들도 함께
> 고쳐야 한다. (앱 안 화면은 로그인해야 보이므로, 로그인 없이 열리는 사본이 따로 필요하다.)

## 확장자 없는 주소

`_redirects` 의 `200` 은 리다이렉트가 아니라 **재작성(rewrite)** 이라 주소창에 `.html` 이
드러나지 않는다.

```
/support    /support.html    200
/terms      /terms.html      200
/privacy    /privacy.html    200
```

앱 사이트(`frontend/public/_redirects`)의 SPA 캐치올(`/*  /index.html  200`)과는 무관하다.
한 사이트에 같이 둘 경우에는 **이 세 줄이 캐치올보다 위에 있어야** 한다 — Netlify 는 위에서부터
읽고 처음 매칭된 규칙 하나만 적용하므로, `/*` 가 먼저 오면 전부 앱 화면으로 삼켜진다.

## 배포

Netlify 사이트: **`ornate-quokka-deff1f.netlify.app`** (2026-09-01 생성).
`landing/` 폴더를 그대로 게시한다 — 순수 HTML 이라 빌드 과정이 없다(드래그&드롭이면 폴더째,
Git 연동이면 publish directory 를 `landing`, 빌드 명령은 비워 둔다).

> 앱 웹 버전(`frontend/dist`)은 **별개 사이트**다. 둘을 한 사이트에 합치지 않는 이유는 위
> "왜 별도 폴더인가" 참고.

### 도메인 연결 (가비아 → Netlify)

`dubly.co.kr` 은 가비아 등록이고 네임서버도 가비아 기본(`ns.gabia.net`)이다. 네임서버는 그대로
두고 레코드만 추가한다 — My가비아 → 서비스관리 → 도메인 → DNS 관리:

| 호스트 | 타입 | 값 |
| --- | --- | --- |
| `@` | A | `75.2.60.5` |
| `www` | CNAME | `ornate-quokka-deff1f.netlify.app.` (끝에 점) |

가비아는 apex(`@`)에 CNAME 을 넣을 수 없어 A 레코드를 쓴다. `75.2.60.5` 는 Netlify 공용
로드밸런서라 사이트 이름과 무관하게 같다.

DNS 만 넣으면 `75.2.60.5` 가 "Netlify" 까지만 가리킬 뿐이라 **404 가 뜬다**. 어느 사이트가
그 호스트명을 받을지는 Netlify 쪽 등록으로 정해진다 — Domain management → Add a domain →
`dubly.co.kr` → Primary domain 지정 → HTTPS 에서 Verify DNS configuration(인증서 자동 발급).

기존 메일 레코드(Resend 의 DKIM·MX·SPF·DMARC)가 가비아에 이미 있으므로 **네임서버를 Netlify DNS
로 넘기지 않는다.** 넘기면 그 4개를 전부 옮겨 다시 만들어야 하고 그 사이 메일이 끊긴다.

## 스토어에 넣는 값

| 항목 | 값 |
| --- | --- |
| 개인정보처리방침 URL | `https://dubly.co.kr/privacy` |
| 지원 URL | `https://dubly.co.kr/support` |
| 마케팅 URL (선택) | `https://dubly.co.kr` |

## 남은 일

- 스토어 출시 후 `index.html` 의 `.store-btn` 을 실제 스토어 링크로 교체하고 `is-pending` 제거
- 앱 웹 버전을 쓸 거라면 `app.dubly.co.kr` 서브도메인으로 분리하고,
  Railway 의 `CORS_ALLOWED_ORIGINS` 에 그 주소를 추가(안 하면 브라우저 요청이 전부 차단된다)
