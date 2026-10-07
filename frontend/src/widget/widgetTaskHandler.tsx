/**
 * 위젯 태스크 핸들러 — Android 가 위젯 추가/주기 갱신/리사이즈 시 headless 로 호출한다.
 *
 * 기본은 앱이 남긴 캐시(widgetData)를 읽어 그린다. D-day 는 렌더 시점에 다시 계산되므로 캐시가 오래돼도 날짜는 맞는다.
 *
 * <p><b>상대 무드만은 여기서 한 번 물어본다</b>(추가·주기 갱신 때). 무드는 하루에도 여러 번 바뀌는 "지금 상태"라
 * 앱을 열 때만 바뀌면 위젯이 반나절씩 낡는다. 저장된 토큰으로 GET /mood 한 번이고(api/client 가 만료 시 갱신),
 * 5초 안에 못 받거나 로그아웃 상태면 조용히 캐시로 그린다 — 위젯이 비거나 멈추면 안 된다.
 */
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { DoublyWidget } from './DoublyWidget';
import { loadWidgetData, saveWidgetData, widgetMoodOf, type WidgetData } from './widgetData';

/** 상대 무드를 새로 받아 캐시에 합친다. 실패하면 캐시 그대로 */
async function withFreshPartnerMood(cached: WidgetData | null): Promise<WidgetData | null> {
  if (!cached?.connected) return cached;
  try {
    const { moodApi } = await import('../api/mood');
    const res = await Promise.race([
      moodApi.current(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    const partner = res.partner;
    const next: WidgetData = {
      ...cached,
      partnerMood: partner ? widgetMoodOf(partner) : null,
    };
    await saveWidgetData(next);
    return next;
  } catch {
    return cached;
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
      props.renderWidget(<DoublyWidget data={await withFreshPartnerMood(await loadWidgetData())} />);
      break;
    case 'WIDGET_RESIZED':
      // 크기만 바뀐 것 — 네트워크 없이 캐시로 다시 그린다
      props.renderWidget(<DoublyWidget data={await loadWidgetData()} />);
      break;
    default:
      // WIDGET_DELETED 등 — 할 일 없음 (클릭은 clickAction="OPEN_APP" 이 처리)
      break;
  }
}
