/** 1~5(또는 1~3) 평점을 ★☆ 문자열로 — PlaceDetailScreen/PlaceScreen/LovelichelinBadge 공용 */
export function stars(rating?: number | null): string {
  if (!rating) return '';
  return '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
}

/** 빈 별 없이 채워진 별만 — 럽슐랭 등급(1~3)처럼 만점이 고정이지 않은 곳에 쓴다 */
export function filledStars(rating?: number | null): string {
  return rating ? '★'.repeat(rating) : '';
}
