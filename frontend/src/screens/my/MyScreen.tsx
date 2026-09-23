/** MY — 미니멀·발랄. 프로필(이름 편집) + 로그아웃/탈퇴 */
import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Avatar } from '../../components/Avatar';
import { Chip } from '../../components/Chip';
import { Sheet } from '../../components/Sheet';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { DateField } from '../../components/DateField';
import { BadgeCard } from '../../components/BadgeCard';
import { LevelCard } from '../../components/LevelCard';
import { WeeklyRecapCard } from '../../components/WeeklyRecapCard';
import { LockedCard } from '../../components/LockedCard';
import { useAuthStore } from '../../store/authStore';
import { relationApi } from '../../api/relation';
import { selectEndedCouples, useRelationStore } from '../../store/relationStore';
import { streakApi } from '../../api/streak';
import { summaryApi } from '../../api/summary';
import { publishEnsuringConnection } from '../../api/chatSocket';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { pickImageAsset, uploadImage, type PickedImage } from '../../utils/imageUpload';
import { AvatarCropSheet } from '../../components/AvatarCropSheet';
import { colors, fontSize, spacing } from '../../constants/theme';
import type { Gender, UserLevel, WeeklyRecap } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

// 식단 뱃지 — 운동(7/30/100)과 같은 단계, 식단 스트릭 기준
const MEAL_BADGES = [
  { days: 7, icon: 'medal-outline' as const, label: '7일' },
  { days: 30, icon: 'medal' as const, label: '30일' },
  { days: 100, icon: 'trophy' as const, label: '100일' },
];

type Props = NativeStackScreenProps<HomeStackParamList, 'My'>;

export function MyScreen({ navigation }: Props) {
  const { user, logout, withdraw, updateProfile } = useAuthStore();
  const couple = useRelationStore((s) => s.couple);
  const relations = useRelationStore((s) => s.relations);
  const fetchRelations = useRelationStore((s) => s.fetchAll);
  const endRelation = useRelationStore((s) => s.end);
  const purgeRecords = useRelationStore((s) => s.purgeRecords);
  const restoreRecords = useRelationStore((s) => s.restoreRecords);
  const endedCouples = selectEndedCouples(relations);
  const [disconnecting, setDisconnecting] = useState(false);
  const [purgingId, setPurgingId] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [canRestore, setCanRestore] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  // 신체 정보(키/생년월일/성별) — 실시간 에너지 밸런스(기초대사량) 계산에 쓰인다
  const [bodyEditing, setBodyEditing] = useState(false);
  const [heightCm, setHeightCm] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [savingBody, setSavingBody] = useState(false);
  const [maxStreak, setMaxStreak] = useState(0);
  const [maxMealStreak, setMaxMealStreak] = useState(0);
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [level, setLevel] = useState<UserLevel | null>(null);
  const [sharing, setSharing] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  /** 크롭 대기 중인 원본 — null 이면 크롭 시트가 닫힌 상태 */
  const [cropSource, setCropSource] = useState<PickedImage | null>(null);

  useFocusEffect(
    useCallback(() => {
      streakApi.me().then((s) => setMaxStreak(s.maxCount)).catch(() => setMaxStreak(0));
      streakApi.mealMe().then((s) => setMaxMealStreak(s.maxCount)).catch(() => setMaxMealStreak(0));
      summaryApi.weeklyRecap().then(setRecap).catch(() => setRecap(null));
      summaryApi.level().then(setLevel).catch(() => setLevel(null));
      fetchRelations().catch(() => {});
      // 커플 연결이 없으면 404 가 나므로 실패는 "없음"으로 취급한다
      relationApi.hasRestorableRecords().then(setCanRestore).catch(() => setCanRestore(false));
    }, [fetchRelations]),
  );

  const onShareRecap = async () => {
    if (!couple?.id || !recap) return;
    setSharing(true);
    try {
      const partner = recap.partnerName ?? '상대';
      const content =
        `지난주 결산\n` +
        `나 ${recap.myWorkoutDays}일 ${recap.myMealDays}일 · ` +
        `${partner} ${recap.partnerWorkoutDays}일 ${recap.partnerMealDays}일\n` +
        `함께 ${recap.bothWorkoutDays}일 ${recap.bothMealDays}일 `;
      const ok = await publishEnsuringConnection(couple.id, { messageType: 'TEXT', content });
      if (ok) {
        haptics.success();
        toast.success('채팅에 공유했어요 ');
      } else {
        toast.error('연결이 끊겼어요. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setSharing(false);
    }
  };

  const startEdit = () => {
    setName(user?.name ?? '');
    setEditing(true);
  };

  const onSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateProfile({ name: name.trim() });
      haptics.success();
      toast.success('프로필을 수정했어요 ');
      setEditing(false);
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const startBodyEdit = () => {
    setHeightCm(user?.heightCm ? String(user.heightCm) : '');
    setBirthDate(user?.birthDate ?? '');
    setGender(user?.gender ?? undefined);
    setBodyEditing(true);
  };

  const onSaveBody = async () => {
    setSavingBody(true);
    try {
      await updateProfile({
        heightCm: heightCm ? Number(heightCm) : undefined,
        birthDate: birthDate || undefined,
        gender,
      });
      haptics.success();
      toast.success('신체 정보를 저장했어요 ');
      setBodyEditing(false);
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSavingBody(false);
    }
  };

  /**
   * 사진 고르기 → <b>원형 크롭</b> → 업로드. 크롭을 사이에 끼우려고 둘로 갈랐다.
   *
   * <p>업로드는 크롭을 확정한 뒤 한 번만 한다 — 사진 한도가 서버의 서명 발급 시점에
   * 깎이므로(backend UploadController), 크롭을 다시 잡을 때마다 올리면 한도만 축난다.
   */
  const onChangePhoto = async () => {
    try {
      const picked = await pickImageAsset();
      if (!picked) return;
      setCropSource(picked);
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    }
  };

  const onCropConfirm = async (uri: string) => {
    setCropSource(null);
    try {
      setPhotoUploading(true);
      const url = await runBusy('사진 올리는 중…', () => uploadImage(uri));
      await updateProfile({ profileImageUrl: url });
      haptics.success();
      toast.success('프로필 사진을 변경했어요 ');
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setPhotoUploading(false);
    }
  };

  const onLogout = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => logout() },
    ]);
  };

  /* [트레이너 기능 일시 비활성화] 되돌리려면 이 블록과 아래 트레이너 메뉴/배지 주석을 해제한다.
  const isTrainer = user?.role === 'TRAINER';
  // 회원 측 활성 트레이너 관계 (트레이너 본인은 회원 관리 화면을 쓰므로 제외)
  const myTrainer = !isTrainer
    ? relations.find((r) => r.relationType === 'TRAINER_MEMBER' && r.status === 'ACTIVE') ?? null
    : null;

  const onDisconnectTrainer = () => {
    if (!myTrainer) return;
    const trainerName = myTrainer.partner?.name ?? '트레이너';
    Alert.alert('트레이너 연결 끊기', `${trainerName}님과의 연결을 끊을까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '연결 끊기',
        style: 'destructive',
        onPress: async () => {
          try {
            await endRelation(myTrainer.id);
            haptics.success();
            toast.success('트레이너 연결을 끊었어요.');
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };
  */

  const onDisconnectCouple = () => {
    if (!couple) return;
    const partnerName = couple.partner?.name ?? '상대방';
    Alert.alert(
      '커플 연결 끊기',
      `${partnerName}님과의 연결을 끊을까요?\n채팅·공유 기록은 더 이상 볼 수 없게 돼요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '연결 끊기',
          style: 'destructive',
          onPress: async () => {
            setDisconnecting(true);
            try {
              await endRelation(couple.id);
              haptics.success();
              toast.success('커플 연결을 끊었어요.');
            } catch (e) {
              Alert.alert('오류', getErrorMessage(e));
            } finally {
              setDisconnecting(false);
            }
          },
        },
      ],
    );
  };

  /**
   * 지난 기록 불러오기 — 양쪽이 모두 요청해야 복원된다.
   * 첫 요청은 접수만 되므로, 대기 상태임을 분명히 알려야 사용자가 실패로 오해하지 않는다.
   */
  const onRestoreRecords = () => {
    const partnerName = couple?.partner?.name ?? '상대방';
    Alert.alert(
      '지난 기록 불러오기',
      `${partnerName}님과 예전에 함께 남긴 기록을 다시 가져올까요?\n`
        + '두 사람이 모두 요청해야 불러와져요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '불러오기',
          onPress: async () => {
            setRestoring(true);
            try {
              const result = await restoreRecords();
              haptics.success();
              if (result.status === 'RESTORED') {
                // 복원되면 지난 기록이 사라지므로 배너를 즉시 내린다.
                // (focus 재진입까지 두면 다시 눌러 "불러올 기록 없음" 에러를 본다)
                setCanRestore(false);
                toast.success(`지난 기록 ${result.movedCount}건을 불러왔어요.`);
              } else {
                toast.info(`요청했어요. ${partnerName}님이 동의하면 불러옵니다.`);
              }
            } catch (e) {
              Alert.alert('오류', getErrorMessage(e));
            } finally {
              setRestoring(false);
            }
          },
        },
      ],
    );
  };

  /**
   * 지난 기록 완전 삭제 — 되돌릴 수 없어 2단계로 확인받는다.
   * 첫 안내에서 "양쪽 모두에서 사라진다"는 점을 반드시 알린다.
   */
  const onPurgeRecords = (relationId: number, partnerName: string) => {
    Alert.alert(
      '지난 기록 완전 삭제',
      `${partnerName}님과의 사진·기록이 서버에서 영구히 지워져요.\n`
        + '되돌릴 수 없고, 상대방도 다시 불러올 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () =>
            Alert.alert('정말 삭제할까요?', '이 작업은 되돌릴 수 없어요.', [
              { text: '취소', style: 'cancel' },
              {
                text: '영구 삭제',
                style: 'destructive',
                onPress: async () => {
                  setPurgingId(relationId);
                  try {
                    await purgeRecords(relationId);
                    haptics.success();
                    toast.success('지난 기록을 완전히 삭제했어요.');
                  } catch (e) {
                    Alert.alert('오류', getErrorMessage(e));
                  } finally {
                    setPurgingId(null);
                  }
                },
              },
            ]),
        },
      ],
    );
  };

  /*
   * 회원 탈퇴 — 가장 파괴적인 동작이므로 "지난 기록 완전 삭제"와 같은 2단계 확인을 쓴다.
   * 이전엔 1단계 확인뿐이었고 진행 중 표시도 없어, 무엇이 지워지는지 모른 채
   * 탈퇴되거나 응답 대기 중 중복 탭이 가능했다.
   */
  const [withdrawing, setWithdrawing] = useState(false);
  const onWithdraw = () => {
    Alert.alert(
      '회원 탈퇴',
      '계정과 개인 기록(운동·식단·체중)이 삭제되고, 연결된 관계도 해제됩니다.\n커플 공동 기록(맛집·피드·여행)은 상대방 화면에서도 사라집니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '계속',
          style: 'destructive',
          onPress: () =>
            Alert.alert('정말 탈퇴할까요?', '삭제된 데이터는 되돌릴 수 없어요.', [
              { text: '취소', style: 'cancel' },
              {
                text: '탈퇴',
                style: 'destructive',
                onPress: async () => {
                  setWithdrawing(true);
                  try {
                    await withdraw();
                  } catch (e) {
                    Alert.alert('오류', getErrorMessage(e));
                  } finally {
                    setWithdrawing(false);
                  }
                },
              },
            ]),
        },
      ],
    );
  };

  const bodySummary = user?.heightCm || user?.birthDate || user?.gender
    ? [
        user?.heightCm ? `${user.heightCm}cm` : null,
        user?.birthDate ?? null,
        user?.gender ? (user.gender === 'MALE' ? '남성' : '여성') : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    // 헤더(title: 'MY')가 상단 인셋과 제목을 담당한다 — top 인셋과 화면 내 제목을
    // 중복으로 그리면 "MY"가 두 번 보이고 제목 위 여백이 과다해진다
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/*
          2026-09-23 — 프로필 스탯 카드(80px 아바타·가운데 정렬·상시 "이름 수정" 버튼)를
          왼쪽 정렬 행으로, 신체 정보를 값 한 줄 행으로 바꾸고 편집은 시트로 뺐다
          (docs/SCREEN_DESIGN_PASS_2026-09-23.md §2-4). 레벨·결산·뱃지 카드는 콘텐츠라 그대로다.
        */}
        <SettingsGroup>
          <SettingsRow
            title={user?.name ?? '사용자'}
            note={user?.email ?? undefined}
            leading={<Avatar name={user?.name} imageUrl={user?.profileImageUrl} size={48} color={colors.meFill} />}
            onPress={startEdit}
            accessibilityLabel="프로필 편집"
          />
          {/* 실시간 에너지 밸런스(기초대사량 + 오늘 운동 소모 - 섭취) 계산에 쓰인다.
              럽바디 탭 홈에서 이 정보가 없으면 계산을 못 하고 CTA 로 여기로 안내한다. */}
          <SettingsRow
            title="신체 정보"
            value={bodySummary ?? '등록'}
            onPress={startBodyEdit}
            accessibilityLabel={bodySummary ? `신체 정보 ${bodySummary}, 수정` : '신체 정보 등록'}
          />
        </SettingsGroup>

        {level ? (
          <View style={styles.card}>
            <LevelCard level={level} />
          </View>
        ) : null}

        {recap ? (
          <View style={styles.card}>
            {/*
              잠기면 수치가 전부 0 으로 내려온다. 그대로 그리면
              "지난주에 아무것도 안 했어요"로 보이므로 반드시 locked 를 먼저 본다.
            */}
            {recap.locked ? (
              <LockedCard
                title="지난주 결산"
                description="둘이 함께한 한 주를 요약해서 볼 수 있어요"
                upgradeMessage="주간 결산은 PRO에서 볼 수 있어요."
              />
            ) : (
              <WeeklyRecapCard recap={recap} onShare={onShareRecap} sharing={sharing} />
            )}
          </View>
        ) : null}

        <View style={styles.card}>
          <BadgeCard title="운동 뱃지" maxStreak={maxStreak} />
        </View>
        <View style={styles.card}>
          <BadgeCard title="식단 뱃지" maxStreak={maxMealStreak} badges={MEAL_BADGES} />
        </View>

        {/* [트레이너 기능 일시 비활성화] — 트레이너 대시보드·등록·연결 진입은 git 이력 참고 */}

        {couple && canRestore ? (
          <SettingsGroup
            title="지난 기록"
            footer="예전에 함께 남긴 기록이 남아있어요. 두 사람이 모두 요청하면 다시 가져올 수 있어요."
            style={styles.group}
          >
            <SettingsRow title="지난 기록 불러오기" onPress={onRestoreRecords} loading={restoring} />
          </SettingsGroup>
        ) : null}

        {endedCouples.length > 0 ? (
          <SettingsGroup
            title="지난 기록"
            footer="연결이 끊긴 기록이에요. 다시 연결하면 불러올 수 있고, 원하면 지금 완전히 지울 수 있어요."
            style={styles.group}
          >
            {endedCouples.map((rel) => (
              <SettingsRow
                key={rel.id}
                title={`${rel.partner?.name ?? '상대방'}님과의 기록 완전 삭제`}
                danger
                onPress={() => onPurgeRecords(rel.id, rel.partner?.name ?? '상대방')}
                loading={purgingId === rel.id}
              />
            ))}
          </SettingsGroup>
        ) : null}

        {/*
          플랜·상점 — 자발적으로 PRO 를 보러 갈 수 있는 자리(나머지 업셀은 한도에 부딪혔을
          때만 뜬다, docs/PRO_UPSELL_AND_ADS_2026-09-17.md §2). 스티커를 사러 오는 사람과
          PRO 를 보러 오는 사람은 같은 마음이라 같은 묶음에 둔다.
        */}
        <SettingsGroup style={styles.group}>
          <SettingsRow title="플랜" onPress={() => navigation.navigate('Plan')} />
          <SettingsRow title="스티커 상점" onPress={() => navigation.navigate('StickerShop')} />
          <SettingsRow title="설정" onPress={() => navigation.navigate('Settings')} />
          <SettingsRow title="로그아웃" onPress={onLogout} />
        </SettingsGroup>

        {/*
          파괴적 액션은 별도 묶음으로 분리한다 — 로그아웃 바로 아래 연결 끊기·탈퇴가
          1px 구분선만 두고 붙어 있으면 스크롤 관성 중 오탭 한 번으로 되돌릴 수 없는
          동작에 진입한다. 묶음 사이 여백이 완충 지대 역할을 한다.
        */}
        <SettingsGroup style={styles.dangerGroup}>
          {couple ? <SettingsRow title="커플 연결 끊기" danger onPress={onDisconnectCouple} loading={disconnecting} /> : null}
          <SettingsRow title="회원 탈퇴" danger onPress={onWithdraw} loading={withdrawing} />
        </SettingsGroup>

        <Text style={styles.footer}>Dubly · 둘이라서, 두 배로</Text>
      </ScrollView>

      {/* 프로필 편집 시트 — 사진 + 이름 */}
      <Sheet visible={editing} onClose={() => setEditing(false)} position="bottom">
        <View style={styles.sheetAvatarRow}>
          <Avatar name={user?.name} imageUrl={user?.profileImageUrl} size={72} color={colors.meFill} />
          <Button
            title="사진 바꾸기"
            variant="soft"
            size="sm"
            onPress={onChangePhoto}
            disabled={photoUploading}
            loading={photoUploading}
          />
        </View>
        <TextField label="이름" value={name} onChangeText={setName} placeholder="이름" maxLength={50} />
        <View style={styles.sheetActions}>
          <Button title="취소" variant="ghost" size="md" onPress={() => setEditing(false)} style={styles.flex} />
          <Button title="저장" size="md" onPress={onSave} loading={saving} disabled={!name.trim()} style={styles.flex} />
        </View>
      </Sheet>

      {/* 신체 정보 시트 */}
      <Sheet visible={bodyEditing} onClose={() => setBodyEditing(false)} position="bottom">
        <Text style={styles.sheetTitle}>신체 정보</Text>
        <Text style={styles.sheetDesc}>키·생년월일·성별로 럽바디 탭의 칼로리 잔여량을 계산해요.</Text>
        <TextField
          label="키(cm)"
          value={heightCm}
          onChangeText={(t) => setHeightCm(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="170"
        />
        <DateField label="생년월일" value={birthDate} onChange={setBirthDate} max={new Date().toISOString().slice(0, 10)} />
        <Text style={styles.fieldLabel}>성별</Text>
        <View style={styles.genderRow}>
          {(['MALE', 'FEMALE'] as const).map((g) => (
            <Chip
              key={g}
              label={g === 'MALE' ? '남성' : '여성'}
              selected={gender === g}
              onPress={() => setGender(gender === g ? undefined : g)}
              fill
            />
          ))}
        </View>
        <View style={styles.sheetActions}>
          <Button title="취소" variant="ghost" size="md" onPress={() => setBodyEditing(false)} style={styles.flex} />
          <Button title="저장" size="md" onPress={onSaveBody} loading={savingBody} style={styles.flex} />
        </View>
      </Sheet>

      {/* 원형 크롭 — 동그라미 안에 들어갈 부분을 직접 맞춘 뒤에야 업로드로 넘어간다 */}
      <AvatarCropSheet
        source={cropSource}
        onCancel={() => setCropSource(null)}
        onConfirm={onCropConfirm}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, flexGrow: 1 },
  card: { marginTop: spacing.md },
  group: { marginTop: spacing.lg },
  // 파괴 액션 묶음 — 위쪽 여백을 넓혀 일반 메뉴와 시각적으로 분리한다
  dangerGroup: { marginTop: spacing.xl },
  flex: { flex: 1 },
  footer: { textAlign: 'center', color: colors.textTertiary, fontSize: fontSize.caption, marginTop: 'auto', paddingTop: spacing.xl },

  sheetTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  sheetDesc: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18, marginTop: spacing.xxs, marginBottom: spacing.md },
  sheetAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  fieldLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.sm },
  genderRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
}));
