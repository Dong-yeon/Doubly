/**
 * 오늘 운동 체크인 카드 — <b>가장 느슨한 기록 경로</b>.
 *
 * <p>세트·횟수·무게를 요구하면 "오늘 운동했다"는 사실 하나만 남기고 싶은 사람은 아무것도
 * 남길 수 없다. 그런데 스트릭·캘린더·커플 카드가 보는 건 세트가 아니라 <b>기록의 존재</b>라,
 * 빈 기록만으로도 그 목적은 전부 충족된다. 자세히 남기고 싶은 경로는 운동 홈에 그대로 있다.
 *
 * <p><b>왜 컴포넌트로 뽑았나</b>: 운동이 독립 탭에서 럽바디 탭의 카드로 흡수되면서
 * (docs/ALBUM_TAB_IA_2026-09-14.md 5-2) 럽바디 메인(DietScreen)과 운동 홈(WorkoutScreen)
 * 두 화면이 같은 체크인을 보여줘야 한다. 한쪽만 고치면 두 화면의 동작이 갈라진다.
 *
 * <p>문구는 트래커가 아니라 <b>챙김</b>의 어휘를 쓴다("챙겼나요?") — 탭 이름의 "바디"가
 * 몸매 관리로 읽히지 않게 하는 장치이고, 9/9 "느슨하게" 결정과 같은 방향이다.
 *
 * <p>오늘 기록을 읽어오는 책임은 <b>호출하는 화면</b>에 있다(포커스마다 `fetchToday`).
 * 카드가 직접 부르면 운동 홈에서 같은 조회가 두 번 나간다.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '../Button';
import { MaterialCommunityIcons } from '../Icon';
import { useWorkoutStore } from '../../store/workoutStore';
import { useActiveWorkoutStore } from '../../store/activeWorkoutStore';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { haptics } from '../../utils/haptics';
import { toDateString } from '../../utils/date';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { confirmPhotoPrivacy } from '../../utils/photoPrivacy';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = {
  /** 사진 업로드를 마쳤다 — 호출부가 운동 기록 화면을 연다(AI 분석·확인·저장은 거기서) */
  onOpenRecord: (params: { imageUrl: string }) => void;
  /** 하던 운동 이어서 하기 */
  onResume: () => void;
  /** 체크인 저장 직후 — 호출부가 자기 화면의 나머지 데이터(히스토리·스트릭)를 다시 읽는다 */
  onCheckedIn?: () => void;
  /**
   * 운동 홈으로. 럽바디 메인에서만 넘긴다 — 운동 홈 자신에서는 갈 곳이 없으므로
   * 이 prop 이 없을 때 링크를 그리지 않는다.
   */
  onOpenWorkoutHome?: () => void;
};

export function WorkoutCheckinCard({ onOpenRecord, onResume, onCheckedIn, onOpenWorkoutHome }: Props) {
  const today = useWorkoutStore((s) => s.today);
  const save = useWorkoutStore((s) => s.save);
  const fetchToday = useWorkoutStore((s) => s.fetchToday);
  /* 끝내지 않은 운동 — 하단 고정 바(ActiveWorkoutBar)와 같은 원본(기기에 저장된 초안)을 본다 */
  const activeWorkout = useActiveWorkoutStore((s) => s.active);
  const [checkingIn, setCheckingIn] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  /** 오늘 이미 기록이 있는가 — 카드의 상태를 가른다(같은 날 중복 기록 방지도 겸한다) */
  const doneToday = today.length > 0;

  /**
   * 원탭 체크인 — 종목 없이 "오늘 운동했다"만 남긴다.
   *
   * <p>서버가 세트를 필수로 두지 않으므로 빈 배열로 저장하면 끝이다. 스트릭 갱신·커플 알림·
   * 캘린더는 전부 이 저장 하나로 지금까지와 똑같이 동작한다(WorkoutService.save 참고).
   */
  const onQuickCheckIn = async () => {
    setCheckingIn(true);
    try {
      await save({ workoutDate: toDateString(), sets: [] });
      haptics.success();
      toast.success('오늘 운동 챙겼어요! 💪');
      void fetchToday();
      onCheckedIn?.();
    } catch (e) {
      toast.error(getErrorMessage(e, '기록에 실패했어요.'));
    } finally {
      setCheckingIn(false);
    }
  };

  /*
   * 사진으로 기록 — 다른 앱의 운동 완료 화면이나 트레드밀 사진을 그대로 올린다.
   * 업로드까지만 여기서 하고 AI 분석·확인·저장은 기록 화면에 맡긴다(분석이 몇십 초 걸릴 수
   * 있는데 그동안 이 화면을 잡아둘 이유가 없고, 읽은 값을 확인할 자리가 그 화면이다).
   *
   * 올리기 전에 한 번 알린다 — 러닝 앱 화면에는 <b>달린 경로 지도</b>가 함께 찍혀 있고
   * 그건 대개 집 근처다. 사진이 어디까지 가는지 모른 채 위치가 담긴 이미지를 올리게 두면
   * 안 된다(안내는 첫 1회).
   */
  const onPhotoRecord = () => void confirmPhotoPrivacy(() => void startPhotoRecord());

  const startPhotoRecord = async () => {
    setPhotoBusy(true);
    try {
      const picked = await pickImage();
      if (!picked) return;
      const imageUrl = await uploadImage(picked);
      onOpenRecord({ imageUrl });
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 올리지 못했어요.'));
    } finally {
      setPhotoBusy(false);
    }
  };

  /** 운동 홈 링크 — 완료 카드에서는 오른쪽 끝, 체크인 카드에서는 제목 줄 오른쪽 */
  const workoutHomeLink = onOpenWorkoutHome ? (
    <Pressable
      onPress={onOpenWorkoutHome}
      style={({ pressed }) => [styles.homeLink, pressed && styles.pressed]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="운동 홈으로"
    >
      <Text style={styles.homeLinkText}>운동 홈</Text>
      <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
    </Pressable>
  ) : null;

  return (
    <View>
      {/*
        끝내지 않은 운동 — 있으면 체크인보다 <b>먼저</b> 보여준다. 하단 고정 바로도 돌아갈 수
        있지만, "새로 시작"보다 "이어서 하기"가 먼저다.
      */}
      {activeWorkout ? (
        <Pressable
          style={({ pressed }) => [styles.resumeCard, pressed && styles.pressed]}
          onPress={onResume}
          accessibilityRole="button"
          accessibilityLabel={`하던 운동 ${activeWorkout.label} 이어서 하기`}
        >
          <MaterialCommunityIcons name="play-circle-outline" size={28} color={colors.primary} />
          <View style={styles.resumeTexts}>
            <Text style={styles.resumeTitle}>하던 운동이 남아 있어요</Text>
            <Text style={styles.resumeDetail} numberOfLines={1}>
              {activeWorkout.label} ·{' '}
              {activeWorkout.doneSets > 0
                ? `${activeWorkout.doneSets}세트 완료`
                : `${activeWorkout.exerciseCount}종목 담김`}
            </Text>
          </View>
          <Text style={styles.resumeAction}>이어서 하기</Text>
        </Pressable>
      ) : null}

      {/* 이미 오늘 기록이 있으면 버튼 대신 완료 상태만 — 확인 자체가 이 카드의 목적이기도 하다 */}
      {doneToday ? (
        <View style={styles.doneCard}>
          {/* 서브셋 글리프맵에 있는 아이콘만 쓴다(Icon.tsx 주석) — check-circle 은 목록에 없다 */}
          <MaterialCommunityIcons name="calendar-check-outline" size={20} color={colors.success} />
          <Text style={styles.doneLabel}>오늘 운동</Text>
          <Text style={styles.doneValue}>챙겼어요 💪</Text>
          {workoutHomeLink}
        </View>
      ) : (
        <View style={styles.checkinCard}>
          <View style={styles.checkinTitleRow}>
            <Text style={styles.checkinTitle}>오늘 운동 챙겼나요?</Text>
            {workoutHomeLink}
          </View>
          <View style={styles.checkinRow}>
            <Button
              title={checkingIn ? '기록 중…' : '✓ 운동 완료'}
              size="md"
              onPress={onQuickCheckIn}
              loading={checkingIn}
              style={styles.checkinBtn}
            />
            <Button
              title="📷 사진으로"
              variant="secondary"
              size="md"
              onPress={onPhotoRecord}
              loading={photoBusy}
              style={styles.checkinBtn}
            />
          </View>
          <Text style={styles.checkinHint}>
            자세한 기록 없이 눌러도 돼요. 다른 앱 운동 화면을 찍어 올리면 시간·거리도 채워드려요.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  // 회복/음성 카드와 같은 자리·같은 톤이되, 누르는 카드라 조금 더 큼직하게
  checkinCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  checkinTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkinTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary, flexShrink: 1 },
  checkinRow: { flexDirection: 'row', gap: spacing.sm },
  checkinBtn: { flex: 1 },
  checkinHint: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  // 완료 상태 — 운동 홈의 회복 카드와 같은 한 줄 형태(테두리만 success 로 구분)
  doneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  doneLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  doneValue: { fontSize: fontSize.caption, fontWeight: '800', color: colors.success },
  // marginLeft:auto — 완료 줄에서는 오른쪽 끝으로 밀어 회복 카드의 값 위치와 맞춘다
  homeLink: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  homeLinkText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.primary },
  // 재개 카드 — 체크인 카드와 같은 형태를 쓰되 색으로 "지금 할 일"임을 구분한다
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  pressed: { opacity: 0.85 },
  resumeTexts: { flex: 1 },
  resumeTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  resumeDetail: { fontSize: fontSize.caption, color: colors.textSecondary },
  resumeAction: { fontSize: fontSize.caption, fontWeight: '800', color: colors.primary },
}));
