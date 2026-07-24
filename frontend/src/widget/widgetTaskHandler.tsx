/**
 * 위젯 태스크 핸들러 — Android 가 위젯 추가/주기 갱신/리사이즈 시 headless 로 호출한다.
 *
 * 네트워크·인증을 쓰지 않고 앱이 남긴 캐시(widgetData)만 읽어 그린다.
 * D-day 는 렌더 시점에 다시 계산되므로 캐시가 오래돼도 날짜는 맞는다.
 */
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { DoublyWidget } from './DoublyWidget';
import { loadWidgetData } from './widgetData';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<DoublyWidget data={await loadWidgetData()} />);
      break;
    default:
      // WIDGET_DELETED 등 — 할 일 없음 (클릭은 clickAction="OPEN_APP" 이 처리)
      break;
  }
}
