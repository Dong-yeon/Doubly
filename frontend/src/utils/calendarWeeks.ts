/**
 * 월 달력 칸(앞쪽 빈칸 + 1..말일)을 <b>주 단위 줄</b>로 자른다 — 마지막 주는 빈칸으로 일곱 칸을 채운다.
 *
 * <p><b>왜 필요한가</b>(2026-10-05~06): 달력들이 칸 폭을 `${100 / 7}%` 로 주고 flexWrap 으로 줄을 바꿨다.
 * 100/7 은 문자열로 "14.285714285714286" 이라 1/7 보다 아주 조금 크고, Yoga 가 float 로 일곱 칸을 더하면
 * <b>컨테이너 폭에 따라</b> 줄 폭을 넘는다 — 토요일 칸이 다음 줄로 떨어지고 뒤 날짜가 전부 한 칸씩 밀린다
 * ("나의 하루" 달력에서 실제로 보고됨, 같은 계산으로 384·412dp 폭이 걸린다). 줄마다 flex:1 일곱 칸으로
 * 그리면 남는 폭을 나눠 가질 뿐 넘칠 수 없다. 마지막 주를 채우는 이유도 같다 — 칸 수가 줄마다 다르면
 * flex:1 칸 폭이 줄마다 달라진다.
 *
 * <p>줄 안의 위치(0~6)가 곧 요일(0=일)이다 — 호출부가 `index % 7` 대신 그 값을 쓰면 된다.
 */
export function toWeeks<T>(cells: (T | null)[]): (T | null)[][] {
  const padded = [...cells];
  while (padded.length % 7 !== 0) padded.push(null);
  const weeks: (T | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
  return weeks;
}
