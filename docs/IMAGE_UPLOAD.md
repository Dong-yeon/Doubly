# 이미지 전송 설정 (Cloudinary)

채팅 사진 전송은 **Cloudinary**(무료)를 씁니다. 클라이언트가 이미지를 Cloudinary에 올리고,
그 URL만 메시지로 전송합니다. **백엔드 변경은 없습니다.**

> ## 📌 저장소 전략 (결정 기록)
>
> **현재**: Cloudinary 무료 티어를 **순수 저장소 + CDN**으로만 사용. 자동 변환(`w_`/`q_auto`/`f_auto` 등)
> 기능은 **미사용** — 클라이언트가 `expo-image-picker` `quality: 0.7`로 미리 압축해 원본 URL을 그대로 표시한다.
>
> **한계**: Cloudinary 무료는 storage·bandwidth·transform이 같은 25크레딧 풀을 공유한다. 커플 앱은
> 사진이 누적만 되는 구조라, 실사용이 붙으면 저장량 + 반복 조회 **egress(대역폭)**가 크레딧을 갉아먹는다.
> 게다가 우리는 변환 편의(=Cloudinary의 프리미엄 가치)를 0% 쓰므로, 값어치 없이 프리미엄을 내는 미스핏이다.
>
> **전환 목표**: 실사용 트래픽이 붙는 시점에 **Cloudflare R2 presigned PUT**으로 스왑.
> R2는 **egress 무료**(저장 10GB·읽기 1천만/월 무료 티어)라 사진 앱 비용 구조가 완전히 달라진다.
>
> **전환 트리거**: Cloudinary 대시보드에서 storage + bandwidth 크레딧 소진율이 눈에 띄게 오를 때.
> (지금은 테스트/MVP 단계라 무료로 충분 — **미리 바꾸지 말 것.**)
>
> **전환 표면** (추상화가 깨끗해 반나절 규모):
> | 파일 | 변경 |
> |---|---|
> | `UploadController` | Cloudinary SHA-1 서명 → S3 SDK **presigned PUT** (R2는 S3 호환) |
> | `imageUpload.ts` | multipart POST → presigned URL로 **PUT** |
> | `config.ts` / env | cloud name → R2 account/bucket/공개 도메인 |
> | 기존 데이터 | Cloudinary **절대 URL이라 그대로 계속 동작** → 병행 전환 가능 |
>
> **설계 원칙 (하지 말 것)**: 현재는 클라이언트가 스토리지로 **직접 업로드**하고 백엔드는 서명만 발급한다.
> 이미지가 서버를 지나가지 않는다. 백엔드 경유 리사이즈(Thumbnailator 등)는 이 토폴로지를 깨고
> Railway CPU·대역폭을 이미지마다 소모하므로 **채택하지 않는다.** 리사이즈는 클라 압축으로 충분하며,
> 서버 보장 썸네일이 필요해지면 그때 **Cloudflare Image Resizing Worker**(egress 무료)를 얹는다.

## 1. Cloudinary 무료 계정 만들기

1. https://cloudinary.com 가입 (무료)
2. 대시보드에서 **Cloud name** 확인 (예: `dxxxxxx`)

## 2. Unsigned 업로드 프리셋 만들기

1. 우측 상단 **Settings(⚙️) → Upload** 탭
2. **Upload presets → Add upload preset**
3. **Signing Mode** 를 **Unsigned** 로 변경
4. (권장) 안전하게 제한:
   - **Folder**: `fitto` 같은 폴더 지정
   - **Allowed formats**: `jpg,png,webp`
   - **Max file size**: 예: 5MB
5. 저장 후 **preset 이름** 확인 (예: `fitto_unsigned`)

## 3. 앱에 값 채우기

`frontend/src/constants/config.ts` 의 `CLOUDINARY` 를 본인 값으로 수정:

```ts
export const CLOUDINARY = {
  cloudName: 'dxxxxxx',          // 1번에서 확인한 Cloud name
  uploadPreset: 'fitto_unsigned', // 2번에서 만든 preset 이름
};
```

## 4. 의존성 설치 후 실행

```bash
cd frontend
npm install            # expo-image-picker 설치
npx expo start -c      # → w
```

## 5. 사용

채팅방 입력바 왼쪽 **📷 버튼** → 사진 선택 → 자동 업로드 후 전송됩니다.

---

## 참고 / 보안
- Unsigned 프리셋은 누구나 그 preset으로 업로드할 수 있으므로, 2-4번처럼 **폴더·포맷·용량을 제한**하세요.
- 더 엄격히 하려면 추후 **백엔드 경유 서명 업로드**(Cloudinary SDK)로 전환할 수 있습니다.
  우리는 메시지에 URL만 저장하므로 저장소(S3 등)로 바꿔도 백엔드 구조는 그대로입니다.
- 설정 전(placeholder)에는 📷 전송 시 "이미지 업로드가 아직 설정되지 않았어요" 안내가 뜹니다.

---

## 서명(signed) 업로드로 전환 (권장 — 출시 준비)

unsigned preset 은 클라이언트에 노출되어 악용 시 스토리지가 오염될 수 있다.
백엔드에 Cloudinary 자격을 설정하면 앱이 자동으로 **서명 업로드**를 사용한다
(미설정 시 기존 unsigned 로 폴백하므로 점진 전환 가능).

1. Cloudinary 콘솔 → Settings → API Keys 에서 `API Key` / `API Secret` 확인
2. 백엔드 환경변수 설정 (Railway Variables 또는 로컬 `.env`):
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `CLOUDINARY_FOLDER` (선택, 기본 `fitto`)
3. 동작: 앱이 `POST /api/v1/uploads/signature` 로 로그인 사용자에게만 단기 서명을 받아
   Cloudinary 에 업로드한다. 서명이 폴더를 고정하므로 클라이언트가 임의 변경할 수 없다.
4. 전환 완료 후 콘솔에서 unsigned preset(`fitto_unsigned`)을 비활성화하면 마무리.
