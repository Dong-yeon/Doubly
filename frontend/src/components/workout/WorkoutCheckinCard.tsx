/**
 * 오늘 운동 체크인 카드 — <b>가장 느슨한 기록 경로</b>.
 *
 * <p>세트·횟수·무게를 요구하면 "오늘 운동했다"는 사실 하나만 남기고 싶은 사람은 아무것도
 * 남길 수 없다. 그런데 스트릭·캘린더·커플 카드가 보는 건 세트가 아니라 <b>기록의 존재</b>라,
 * 빈 기록만으로도 그 목적은 전부 충족된다.
 *
 * <p><b>시간은 한 번 더 누르면 남는다(2026-09-27).</b> 예전 원탭은 시간을 비워 저장해 럽바디의
 * "오늘 운동한 만큼 섭취 가능 칼로리"(EnergyBalanceService — 시간 × 가정 MET)에 0kcal 로
 * 잡혔다. 그렇다고 1시간 같은 기본값을 넣으면 10분 산책에도 "400kcal 더 먹어도 돼요"가 된다
 * — 식단 앱에서 과대 추정은 과소 추정보다 해롭다. 그래서 탭 뒤에 시간 칩을 띄우고,
 * <b>건너뛰면 지금처럼 시간 없이</b> 저장한다. 고르는 것도 한 번의 탭이라 "느슨하게"를 깨지 않는다.
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
import { Chip } from '../Chip';
import { MaterialCommunityIcons } from '../Icon';
import { useWorkoutStore } from '../../store/workoutStore';
import { useActiveWorkoutStore } from '../../store/activeWorkoutStore';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { haptics } from '../../utils/haptics';
import { toDateString } from '../../utils/date';
import { pickImage, takePhoto, uploadImage } from '../../utils/imageUpload';
import { Alert } from '../../utils/alert';
import { confirmPhotoPrivacy } from '../../utils/photoPrivacy';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { onColor } from '../../theme/onColor';

type Props = {
  /** 사진 업로드를 마쳤다 — 호출부가 운동 기록 화면을 연다(메모·세트는 거기서 덧붙인다) */
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
  /** "운동 완료"를 눌러 시간 칩을 펼친 상태 — 칩을 고르는 순간 저장한다 */
  const [pickingDuration, setPickingDuration] = useState(false);
  /** 저장 중인 칩 — 누른 칩만 선택 표시한다(null = 건너뛰기) */
  const [savingMin, setSavingMin] = useState<number | null | undefined>(undefined);
  const [photoBusy, setPhotoBusy] = useState(false);

  /** 오늘 이미 기록이 있는가 — 카드의 상태를 가른다(같은 날 중복 기록 방지도 겸한다) */
  const doneToday = today.length > 0;
  /** 오늘 남긴 운동 시간 합 — 완료 줄에 "챙겼어요 · 1시간"으로 보인다. 시간 없는 기록은 0 */
  const todayMin = today.reduce((sum, w) => sum + (w.totalDurationMin ?? 0), 0);

  /**
   * 원탭 체크인 — 종목 없이 "오늘 운동했다"만 남긴다.
   *
   * <p>서버가 세트를 필수로 두지 않으므로 빈 배열로 저장하면 끝이다. 스트릭 갱신·커플 알림·
   * 캘린더는 전부 이 저장 하나로 지금까지와 똑같이 동작한다(WorkoutService.save 참고).
   */
  const onQuickCheckIn = async (durationMin: number | null) => {
    setCheckingIn(true);
    setSavingMin(durationMin);
    try {
      await save({
        workoutDate: toDateString(),
        sets: [],
        // 건너뛰기(null)는 예전처럼 시간 없이 — 소모 칼로리에 잡히지 않는다
        totalDurationMin: durationMin ?? undefined,
      });
      haptics.success();
      toast.success('오늘 운동 챙겼어요! 💪');
      setPickingDuration(false);
      void fetchToday();
      onCheckedIn?.();
    } catch (e) {
      toast.error(getErrorMessage(e, '기록에 실패했어요.'));
    } finally {
      setCheckingIn(false);
      setSavingMin(undefined);
    }
  };

  /*
   * 오운완 인증샷 — 운동 끝난 나를 찍어 남긴다.
   *
   * <b>2026-09-14 에 성격이 바뀌었다.</b> 예전에는 다른 앱의 완료 화면·트레드밀 계기판을
   * 올려 AI 가 시간·거리를 읽는 기능이었다. 읽어낸 값은 어차피 사용자가 확인해야 했고,
   * 정작 남기고 싶어 한 건 "오늘 했다"는 인증샷이었다. 판독을 걷어내고(백엔드
   * analyze-photo 엔드포인트까지) 사진 자체가 기록이 되게 했다.
   *
   * 업로드까지만 여기서 하고 저장은 기록 화면에 맡긴다 — 메모·세트를 덧붙일 자리가 거기다.
   *
   * 올리기 전에 한 번 알린다(첫 1회) — 이 사진은 <b>애인의 우리 기록에도 올라가고</b>,
   * 배경이나 메타데이터로 위치가 딸려 갈 수 있다. 확인한 뒤에야 카메라·앨범이 열린다.
   */
  const onPhotoRecord = () =>
    void confirmPhotoPrivacy(() =>
      Alert.alert('오운완 사진', '어떻게 남길까요?', [
        { text: '취소', style: 'cancel' },
        { text: '앨범에서 고르기', onPress: () => void startPhotoRecord('library') },
        { text: '찍기', onPress: () => void startPhotoRecord('camera') },
      ]),
    );

  const startPhotoRecord = async (source: 'camera' | 'library') => {
    setPhotoBusy(true);
    try {
      const picked = source === 'camera' ? await takePhoto() : await pickImage();
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
          <Text style={styles.doneValue}>챙겼어요{todayMin > 0 ? ` · ${formatMinutes(todayMin)}` : ''}</Text>
          {workoutHomeLink}
        </View>
      ) : (
        <View style={styles.checkinCard}>
          <View style={styles.checkinTitleRow}>
            <Text style={styles.checkinTitle}>오늘 운동 챙겼나요?</Text>
            {workoutHomeLink}
          </View>
          {pickingDuration ? (
            /*
             * 시간 칩 — 버튼 줄 자리를 그대로 쓴다. 고르는 순간 저장, "건너뛰기"는 시간 없이 저장.
             * 칩 넷이 한 줄에 들어가도록 fill 로 균등 분할한다. 저장 중에는 전부 잠근다(연타 방지).
             */
            <View style={styles.durationBox}>
              <View style={styles.durationHead}>
                <Text style={styles.durationTitle}>얼마나 했나요?</Text>
                <Pressable
                  onPress={() => setPickingDuration(false)}
                  disabled={checkingIn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="시간 고르기 닫기"
                >
                  <Text style={styles.durationCancel}>취소</Text>
                </Pressable>
              </View>
              <View style={styles.checkinRow}>
                {DURATION_CHOICES.map((choice) => (
                  <Chip
                    key={choice.label}
                    label={choice.label}
                    selected={savingMin === choice.min}
                    onPress={() => void onQuickCheckIn(choice.min)}
                    disabled={checkingIn}
                    fill
                  />
                ))}
              </View>
            </View>
          ) : (
          <View style={styles.checkinRow}>
            {/* 이모지 대신 leftIcon — 버튼 둘이 곧 안내라 아래 설명 문장은 뺐다(§6-3) */}
            <Button
              title="운동 완료"
              leftIcon={<MaterialCommunityIcons name="calendar-check-outline" size={18} color={onColor(colors.primaryFill)} />}
              size="md"
              onPress={() => setPickingDuration(true)}
              style={styles.checkinBtn}
            />
            <Button
              title="오운완 사진"
              leftIcon={<MaterialCommunityIcons name="camera-outline" size={18} color={colors.textPrimary} />}
              variant="secondary"
              size="md"
              onPress={onPhotoRecord}
              loading={photoBusy}
              style={styles.checkinBtn}
            />
          </View>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * 원탭 시간 선택지 — 흔한 운동 길이 셋 + 건너뛰기. 분 단위로 저장한다.
 * 더 정확히 남기려면 기록 화면(오운완 사진 경로)에서 직접 적는다.
 */
const DURATION_CHOICES: { label: string; min: number | null }[] = [
  { label: '30분', min: 30 },
  { label: '1시간', min: 60 },
  { label: '1시간 반', min: 90 },
  { label: '건너뛰기', min: null },
];

/** 60 → "1시간", 90 → "1시간 30분", 45 → "45분" */
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
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
  durationBox: { gap: spacing.sm },
  durationHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  durationTitle: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  durationCancel: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
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
