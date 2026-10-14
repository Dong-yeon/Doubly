/*
 * 웹에는 광고 SDK 가 없다 — 아무것도 그리지 않는다. AdBanner.tsx 와 같은 이름·props 를 둔다(웹 번들에서 native 모듈을
 * 끌어오지 않게 확장자로 나눈다).
 */
interface Props {
  onRemoveAds?: () => void;
}

export function AdBanner(_props: Props) {
  return null;
}
