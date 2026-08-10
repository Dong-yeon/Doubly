/**
 * Doubly 폰트 토큰 — Pretendard.
 * 폰트 파일은 assets/fonts/ 에 추가하고 app.json 의 expo-font 플러그인으로 임베드한다.
 * (assets/fonts/README.md 참고) 파일이 없으면 시스템 폰트로 자연 폴백된다.
 */
/*
 * regular 는 <b>참조되는 곳이 없다</b>. 파일(1.5MB)까지 받아오면서 쓰지 않는 상태라
 * 로딩 목록에서 뺐다. 본문에 Pretendard 를 적용하기로 하면 그때 다시 넣으면 된다
 * (그 경우 한글 서브셋이 먼저다 — 전체 파일은 웨이트당 1.5MB 다).
 */
export const fonts = {
  medium: 'Pretendard-Medium',
  semiBold: 'Pretendard-SemiBold',
} as const;
