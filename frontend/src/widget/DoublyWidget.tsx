/**
 * Doubly 홈 위젯 UI (Android) — D-day + 상대의 지금 무드 + 나/상대 스트릭.
 *
 * <p>상대 무드가 있으면 오른쪽 윗줄이 "{상대} 😊 한마디", 아랫줄이 두 사람 스트릭을 한 줄로 줄인다.
 * 4×1 위젯 높이(60dp)에 세 줄은 들어가지 않는다. 무드가 없으면 예전처럼 스트릭 두 줄이다.
 *
 * react-native-android-widget 의 위젯 프리미티브만 사용해야 한다
 * (일반 RN 컴포넌트·훅 사용 불가 — 네이티브 RemoteViews 로 변환된다).
 * 색은 Duo Color System: 나=Gold, 상대=Green, 배경=Cream, 텍스트=Ink.
 * 값은 theme/colors.ts 라이트 팔레트(me/partner)와 동일 — 위젯은 헤드리스 태스크로
 * 그려져 Appearance 기반 다크모드를 따르지 않으므로 라이트 값을 그대로 고정한다.
 */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetData } from './widgetData';
import { daysTogether } from './widgetData';

const COLORS = {
  background: '#FBF8F3' as const, // cream
  ink: '#14162B' as const,
  sub: '#62687A' as const,
  me: '#8A6817' as const, // gold (theme.light.me)
  partner: '#2C7D33' as const, // green (theme.light.partner)
};

/** "보리 😴 “야근 중”" — 한마디가 없으면 이름과 이모지만 */
function moodLine(name: string | null, mood: { emoji: string; message?: string | null }): string {
  const who = name ?? '상대';
  const note = mood.message?.trim();
  return note ? `${who} ${mood.emoji} “${note}”` : `${who} 지금 ${mood.emoji}`;
}

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

          {data?.partnerMood ? (
            /* 우: 상대의 지금 무드 + 두 사람 스트릭 한 줄 */
            <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end', flex: 1, marginLeft: 12 }}>
              <TextWidget
                text={moodLine(data.partnerName, data.partnerMood)}
                maxLines={1}
                truncate="END"
                style={{ fontSize: 14, color: COLORS.partner, fontWeight: '700' }}
              />
              <TextWidget
                text={`🔥 나 ${data.myStreak ?? 0}일 · ${data.partnerName ?? '상대'} ${data.partnerStreak ?? 0}일`}
                maxLines={1}
                truncate="END"
                style={{ fontSize: 12, color: COLORS.sub }}
              />
            </FlexWidget>
          ) : (
            /* 우: 나/상대 스트릭 */
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
          )}
        </>
      ) : (
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text="Dubly"
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
