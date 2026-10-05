/**
 * 장애 공지·점검 배너 — 홈 상단. 내용은 landing/status.json(store/serviceStatusStore).
 *
 * <p>비트윈이 2025-09 데이터 삭제 사고 때 비판받은 지점이 "공지가 앱 안에서 안 보였다"였다
 * (docs/BETWEEN_GAP_CHECK_2026-09-30.md). 그래서 푸시·스토어 공지가 아니라 사용자가 매일
 * 여는 홈 맨 위에 둔다.
 *
 * <p>닫으면 같은 updatedAt 동안은 다시 안 뜬다. 점검은 닫아도 API 실패 문구가 계속 "점검 중"으로
 * 나온다(utils/error.ts) — 배너는 알림이고, 점검이라는 사실은 사라지지 않는다.
 */
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { useServiceStatusStore } from '../store/serviceStatusStore';
import { isNoticeActive, type NoticeLevel } from '../utils/serviceStatus';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

const DEFAULT_TITLE: Record<NoticeLevel, string> = {
  info: '공지',
  warning: '서비스 안내',
  maintenance: '서비스 점검 중',
};

const ICON: Record<NoticeLevel, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  info: 'information-outline',
  warning: 'alert-outline',
  maintenance: 'wrench-outline',
};

/**
 * 기간 경계를 넘으면 앱을 다시 열지 않아도 사라지도록 1분마다 다시 본다. 공지가 없을 때도 돈다 —
 * 멈춰 두면 나중에 공지가 도착했을 때 마운트 시각(몇 시간 전일 수 있다)으로 판정하게 된다.
 */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function ServiceStatusBanner() {
  const status = useServiceStatusStore((s) => s.status);
  const dismissedUpdatedAt = useServiceStatusStore((s) => s.dismissedUpdatedAt);
  const dismiss = useServiceStatusStore((s) => s.dismiss);
  const notice = status?.notice ?? null;
  const checkedAt = useServiceStatusStore((s) => s.checkedAt);
  const now = Math.max(useMinuteClock(), checkedAt);

  if (!status || !isNoticeActive(notice, now) || dismissedUpdatedAt === status.updatedAt) return null;

  const tone = toneOf(notice.level);
  return (
    <View style={[styles.box, { backgroundColor: tone.bg }]} accessibilityRole="alert">
      <MaterialCommunityIcons name={ICON[notice.level]} size={20} color={tone.fg} style={styles.icon} />
      <View style={styles.texts}>
        <Text style={[styles.title, { color: tone.fg }]}>{notice.title ?? DEFAULT_TITLE[notice.level]}</Text>
        <Text style={[styles.body, { color: tone.fg }]}>{notice.message}</Text>
        {notice.linkUrl ? (
          <Pressable
            onPress={() => void Linking.openURL(notice.linkUrl!).catch(() => undefined)}
            hitSlop={8}
            accessibilityRole="link"
          >
            <Text style={[styles.link, { color: tone.fg }]}>자세히 보기</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="공지 닫기">
        <MaterialCommunityIcons name="close" size={18} color={tone.fg} />
      </Pressable>
    </View>
  );
}

/* colors 는 읽는 시점의 팔레트를 주는 프록시라 렌더마다 부르면 테마를 따라간다. 짝은 팔레트의 bg/text 쌍. */
function toneOf(level: NoticeLevel): { bg: string; fg: string } {
  switch (level) {
    case 'info':
      return { bg: colors.primaryBg, fg: colors.textPrimary };
    case 'warning':
      return { bg: colors.warningBg, fg: colors.warning };
    case 'maintenance':
      return { bg: colors.dangerBg, fg: colors.dangerText };
  }
}

const styles = themedStyles(() => ({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  icon: { marginTop: 1 },
  texts: { flex: 1, gap: spacing.xxs },
  title: { fontSize: fontSize.body, fontWeight: '700' },
  body: { fontSize: fontSize.caption, lineHeight: 18 },
  link: { fontSize: fontSize.caption, fontWeight: '700', textDecorationLine: 'underline', marginTop: spacing.xxs },
}));
