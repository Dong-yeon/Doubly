/**
 * Doubly 홈 위젯 UI (Android) — D-day + 나/상대 스트릭.
 *
 * react-native-android-widget 의 위젯 프리미티브만 사용해야 한다
 * (일반 RN 컴포넌트·훅 사용 불가 — 네이티브 RemoteViews 로 변환된다).
 * 색은 Duo Color System: 나=Coral, 상대=Indigo, 배경=Cream, 텍스트=Ink.
 */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetData } from './widgetData';
import { daysTogether } from './widgetData';

const COLORS = {
  background: '#FBF8F3' as const, // cream
  ink: '#14162B' as const,
  sub: '#62687A' as const,
  me: '#FF6A4D' as const, // coral
  partner: '#4A5BFF' as const, // indigo
};

export function DoublyWidget({ data }: { data: WidgetData | null }) {
  const connected = !!data?.connected;
  const dday = daysTogether(data?.anniversaryDate ?? null);

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: COLORS.background,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
      }}
    >
      {connected && dday > 0 ? (
        <>
          {/* 좌: D-day */}
          <FlexWidget style={{ flexDirection: 'column' }}>
            <TextWidget text="우리 함께" style={{ fontSize: 12, color: COLORS.sub }} />
            <TextWidget
              text={`D+${dday}`}
              style={{ fontSize: 26, color: COLORS.ink, fontWeight: '800' }}
            />
          </FlexWidget>

          {/* 우: 나/상대 스트릭 */}
          <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
            <TextWidget
              text={`나 🔥 ${data?.myStreak ?? 0}일`}
              style={{ fontSize: 14, color: COLORS.me, fontWeight: '700' }}
            />
            <TextWidget
              text={`${data?.partnerName ?? '상대'} 🔥 ${data?.partnerStreak ?? 0}일`}
              style={{ fontSize: 14, color: COLORS.partner, fontWeight: '700' }}
            />
          </FlexWidget>
        </>
      ) : (
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text="Doubly"
            style={{ fontSize: 16, color: COLORS.ink, fontWeight: '800' }}
          />
          <TextWidget
            text={connected ? '앱을 열어 오늘을 기록해보세요' : '커플을 연결하고 함께 기록해요 💕'}
            style={{ fontSize: 12, color: COLORS.sub }}
          />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
