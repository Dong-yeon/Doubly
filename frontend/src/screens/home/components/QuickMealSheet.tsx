/**
 * 홈 · 오늘 식단 시트 — 히어로의 식단 배지를 누르면 열린다.
 *
 * <p><b>왜 홈에 있나.</b> 이 배지는 원래부터 "탭 안 옮기고 바로 기록"을 맡기로 한 자리다
 * (HomeScreen 의 운동/식단 칩 주석 — 중앙 FAB 를 없앤 대신 이 칩이 그 역할을 물려받았다).
 * 식단 탭에 버튼을 하나 더 만드는 것보다, 이미 그 목적이 정해진 자리에 사진 경로를 얹는 게
 * 새 UI 를 안 늘리면서 더 빠르다 — 홈은 기본 탭이라 탭 전환조차 없다.
 *
 * <p><b>배지가 ✓ 여도 열린다.</b> 배지는 "오늘 기록 있음/없음" 이진값인데 끼니는 하루 세 번이다.
 * 아침을 남겼다고 점심 사진 경로를 막으면 하루에 한 끼밖에 못 남긴다. ✓ 는 잠금이 아니라
 * 상태 표시로 두고, 예전 동작(오늘 기록 보기)은 아래 줄로 남겨 잃는 경로가 없게 한다.
 *
 * <p><b>사진은 폼을 안 거친다.</b> 끼니는 시각으로 정하고(mealTimeSlot) 그 자리에서 저장한다.
 * 칼로리는 저장 뒤 서버가 백그라운드로 채우므로(MealPhotoAutoAnalysisService) 확인할 화면이
 * 필요 없다 — 운동 탭의 "📷 사진으로"가 기록 화면으로 넘어가는 것과 갈리는 지점이다.
 */
import React from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import type { Meal } from '../../../types';
import { formatKcal } from '../../../utils/format';
import { mealTypeForNow, mealTypeLabel } from '../../../utils/mealTimeSlot';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';
import { layout } from '../../../theme/layout';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 오늘 내 기록 — 헤더 요약에만 쓴다(비어 있으면 안내 문구) */
  todayMeals: Meal[];
  /** 사진 업로드~저장이 도는 중 — 시트를 닫지 않고 그 줄만 잠근다 */
  busy: boolean;
  onTakePhoto: () => void;
  onPickPhoto: () => void;
  onWriteManually: () => void;
  onViewToday: () => void;
}

export function QuickMealSheet({
  visible,
  onClose,
  todayMeals,
  busy,
  onTakePhoto,
  onPickPhoto,
  onWriteManually,
  onViewToday,
}: Props) {
  const kcal = todayMeals.reduce((sum, m) => sum + (m.calories ?? 0), 0);
  /* 지금 사진을 올리면 어느 끼니가 되는지 미리 알려준다 — 저장하고 나서 알면 늦다 */
  const slot = mealTypeLabel(mealTypeForNow());

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>오늘 식단</Text>
            <Text style={styles.summary}>
              {todayMeals.length > 0
                ? `${todayMeals.length}끼 기록함${kcal > 0 ? ` · ${formatKcal(kcal)}` : ''}`
                : '아직 기록이 없어요'}
            </Text>
          </View>

          <Row
            icon="camera-outline"
            label="사진 찍기"
            desc={`${slot}으로 바로 기록돼요`}
            busy={busy}
            onPress={onTakePhoto}
          />
          <Row
            icon="image-outline"
            label="앨범에서 고르기"
            desc={`${slot}으로 바로 기록돼요`}
            busy={busy}
            onPress={onPickPhoto}
          />
          <Row
            icon="pencil-outline"
            label="직접 적기"
            desc="끼니·음식·칼로리를 직접 채워요"
            onPress={onWriteManually}
          />

          <View style={styles.divider} />

          <Row icon="format-list-bulleted" label="오늘 기록 보기" onPress={onViewToday} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  icon,
  label,
  desc,
  busy,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  desc?: string;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={busy ? undefined : onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={desc ? `${label} — ${desc}` : label}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.icon} />
      ) : (
        <MaterialCommunityIcons name={icon} size={20} color={colors.textPrimary} style={styles.icon} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {desc ? <Text style={styles.desc}>{desc}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  header: { paddingHorizontal: spacing.xs, paddingBottom: spacing.sm },
  title: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  summary: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  // 로딩 인디케이터와 아이콘의 폭을 맞춰, 도는 동안 글자가 좌우로 흔들리지 않게 한다
  icon: { width: 20, alignItems: 'center' },
  rowText: { flex: 1 },
  label: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  desc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 1 },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
    marginHorizontal: spacing.xs,
  },
}));
