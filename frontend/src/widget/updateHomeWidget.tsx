/**
 * 앱 → 위젯 갱신 진입점.
 *
 * 홈 화면이 관계·스트릭 데이터를 성공적으로 불러올 때마다 호출한다.
 * 캐시를 남기고(주기 갱신용) 즉시 다시 그린다(체감 반영용).
 * Android 외 플랫폼·위젯 미설치 상태에서는 조용히 아무 것도 하지 않는다.
 */
import React from 'react';
import { Platform } from 'react-native';
import { saveWidgetData, WidgetData } from './widgetData';

export async function updateHomeWidget(data: WidgetData): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await saveWidgetData(data);
    const { requestWidgetUpdate } = await import('react-native-android-widget');
    const { DoublyWidget } = await import('./DoublyWidget');
    await requestWidgetUpdate({
      widgetName: 'Doubly',
      renderWidget: () => <DoublyWidget data={data} />,
      widgetNotFound: () => {
        // 홈 화면에 위젯을 추가하지 않은 사용자 — 정상
      },
    });
  } catch {
    // Expo Go 등 네이티브 모듈이 없는 환경 — 위젯 없이 정상 동작
  }
}
