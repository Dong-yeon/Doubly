/**
 * 잠긴 기능을 뭐라고 안내할지 — 업그레이드 유도와 한도 소진을 가른다.
 *
 * <p><b>왜 필요한가</b>: 서버는 실행 시점에 402(결제로 풀림)와 429(이미 PRO, 한도 소진)를
 * 이미 갈라서 던진다. 그런데 화면이 <b>미리 그리는</b> 잠금 표시는 `allowed`(불리언) 하나만
 * 보고 있어서 둘이 합쳐졌고, 그래서 영구 PRO 계정이 우리 이모지 월 4회를 다 쓰면
 * "우리 이모지는 PRO에서 만들 수 있어요"가 떴다. 돈 낸 사람에게 결제를 또 권하는 문구다.
 *
 * <p>판정 근거는 서버가 내려주는 {@link FeatureState.upgradable} 하나뿐이다 — 앱은 FREE/PRO
 * 한도 숫자를 모르고, 알아서도 안 된다(가격 정책을 바꿀 때마다 스토어 심사를 기다리게 된다).
 */
import type { FeatureState } from '../types';

/** 기간 한도를 다 썼을 때의 안내 — "언제 다시 채워지는가"까지 말해야 기다릴 수 있다. */
export function quotaExhaustedNotice(state: FeatureState): string {
  switch (state.period) {
    case 'DAY':
      return `오늘 ${state.limit}회를 다 썼어요 · 내일 다시 채워져요`;
    case 'WEEK':
      return `이번 주 ${state.limit}회를 다 썼어요 · 다음 주에 다시 채워져요`;
    case 'MONTH':
      return `이번 달 ${state.limit}회를 다 썼어요 · 다음 달에 다시 채워져요`;
    // 개수형은 리셋되지 않는다 — 기다리는 게 아니라 지워야 한다.
    case 'TOTAL':
      return `${state.limit}개까지 가질 수 있어요 · 지우면 다시 만들 수 있어요`;
    case 'NONE':
      return '지금은 이용 한도를 모두 사용했어요';
  }
}

/**
 * 잠겼는데 <b>결제로는 안 풀리는</b> 상태인가 — 이때는 업그레이드 시트를 열지 않는다.
 *
 * <p>플랜을 아직 못 받았으면(`undefined`) false 다. 스토어 기본값이 "열려 있음"인 것과 같은
 * 이유로, 모를 때 잠금처럼 굴면 통신 문제가 기능 고장으로 보인다.
 */
export function isQuotaExhausted(state: FeatureState | undefined): state is FeatureState {
  return state !== undefined && !state.allowed && !state.upgradable;
}
