/** MY — 미니멀·발랄. 프로필(이름 편집) + 로그아웃/탈퇴 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { MaterialCommunityIcons } from '../../components/Icon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
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
import { colors, fontSize, radius, spacing } from '../../constants/theme';
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

  return (
    // 헤더(title: 'MY')가 상단 인셋과 제목을 담당한다 — top 인셋과 화면 내 제목을
    // 중복으로 그리면 "MY"가 두 번 보이고 제목 위 여백이 과다해진다
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Card elevation="md" style={styles.profile}>
          <Pressable onPress={onChangePhoto} disabled={photoUploading} style={styles.avatarWrap}>
            <Avatar name={user?.name} imageUrl={user?.profileImageUrl} size={80} />
            <View style={styles.cameraBadge}>
              {photoUploading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <MaterialCommunityIcons name="camera" size={15} color={colors.white} />
              )}
            </View>
          </Pressable>

          {editing ? (
            <View style={styles.editBox}>
              <TextField value={name} onChangeText={setName} placeholder="이름" maxLength={50} />
              <View style={styles.editActions}>
                <Button title="취소" variant="ghost" size="md" onPress={() => setEditing(false)} style={styles.flex} />
                <Button title="저장" size="md" onPress={onSave} loading={saving} disabled={!name.trim()} style={styles.flex} />
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.name}>{user?.name ?? '사용자'}</Text>
              <Text style={styles.email}>{user?.email ?? ''}</Text>
              {/* [트레이너 기능 일시 비활성화]
              {user?.role === 'TRAINER' ? <Text style={styles.badge}>트레이너</Text> : null}
              */}
              <Button title="이름 수정" variant="soft" size="md" onPress={startEdit} style={styles.editBtn} />
            </>
          )}
        </Card>

        {/* 신체 정보 — 실시간 에너지 밸런스(기초대사량 + 오늘 운동 소모 - 섭취) 계산에 쓰인다.
            식단 탭 홈에서 이 정보가 없으면 계산을 못 하고 CTA 로 여기로 안내한다. */}
        <Card elevation="sm" style={styles.bodyCard}>
          <Text style={styles.bodyLabel}>신체 정보</Text>
          <Text style={styles.bodyDesc}>키·생년월일·성별을 등록하면 식단 탭에서 실시간 칼로리 잔여량을 계산해줘요.</Text>
          {bodyEditing ? (
            <View style={styles.editBox}>
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
                  <Pressable
                    key={g}
                    style={({ pressed }) => [
                      styles.genderChip,
                      gender === g && styles.genderChipActive,
                      pressed && styles.genderChipPressed,
                    ]}
                    onPress={() => setGender(gender === g ? undefined : g)}
                  >
                    <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>
                      {g === 'MALE' ? '남성' : '여성'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.editActions}>
                <Button title="취소" variant="ghost" size="md" onPress={() => setBodyEditing(false)} style={styles.flex} />
                <Button title="저장" size="md" onPress={onSaveBody} loading={savingBody} style={styles.flex} />
              </View>
            </View>
          ) : (
            <View style={styles.bodyRow}>
              <Text style={styles.bodyValue}>
                {user?.heightCm ? `${user.heightCm}cm` : '키 미등록'}
                {' · '}
                {user?.birthDate ?? '생년월일 미등록'}
                {' · '}
                {user?.gender ? (user.gender === 'MALE' ? '남성' : '여성') : '성별 미등록'}
              </Text>
              <Button title="수정" variant="soft" size="sm" onPress={startBodyEdit} />
            </View>
          )}
        </Card>

        {level ? (
          <View style={styles.badgeWrap}>
            <LevelCard level={level} />
          </View>
        ) : null}

        {recap ? (
          <View style={styles.badgeWrap}>
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

        <View style={styles.badgeWrap}>
          <BadgeCard title="운동 뱃지" maxStreak={maxStreak} />
        </View>
        <View style={styles.badgeWrap}>
          <BadgeCard title="식단 뱃지" maxStreak={maxMealStreak} badges={MEAL_BADGES} />
        </View>

        {/* [트레이너 기능 일시 비활성화] 트레이너 — 트레이너면 대시보드, 아니면 등록/연결 진입
        <Card elevation="sm" style={styles.menu}>
          {isTrainer ? (
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
              onPress={() => navigation.navigate('TrainerDashboard')}
            >
              <Text style={styles.menuText}>트레이너 대시보드</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
                onPress={() => navigation.navigate('TrainerRegister')}
              >
                <Text style={styles.menuText}>트레이너로 등록하기</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
              <View style={styles.divider} />
              {myTrainer ? (
                <Pressable
                  style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
                  onPress={onDisconnectTrainer}
                >
                  <Text style={styles.menuText}>내 트레이너 · {myTrainer.partner?.name ?? '트레이너'}</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
                  onPress={() => navigation.navigate('TrainerConnect')}
                >
                  <Text style={styles.menuText}>트레이너 연결하기</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              )}
            </>
          )}
        </Card>
        */}

        {couple && canRestore ? (
          <Card elevation="sm" style={styles.menu}>
            <Text style={styles.sectionLabel}>지난 기록</Text>
            <Text style={styles.sectionDesc}>
              예전에 함께 남긴 기록이 남아있어요. 두 사람이 모두 요청하면 다시 가져올 수 있어요.
            </Text>
            <View style={styles.divider} />
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
              onPress={onRestoreRecords}
              disabled={restoring}
            >
              <Text style={styles.menuText}>지난 기록 불러오기</Text>
              {restoring ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.chevron}>›</Text>
              )}
            </Pressable>
          </Card>
        ) : null}

        {endedCouples.length > 0 ? (
          <Card elevation="sm" style={styles.menu}>
            <Text style={styles.sectionLabel}>지난 기록</Text>
            <Text style={styles.sectionDesc}>
              연결이 끊긴 기록이에요. 다시 연결하면 불러올 수 있고, 원하면 지금 완전히 지울 수 있어요.
            </Text>
            {endedCouples.map((rel) => (
              <View key={rel.id}>
                <View style={styles.divider} />
                <Pressable
                  style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
                  onPress={() => onPurgeRecords(rel.id, rel.partner?.name ?? '상대방')}
                  disabled={purgingId === rel.id}
                >
                  <Text style={[styles.menuText, styles.danger]}>
                    {rel.partner?.name ?? '상대방'}님과의 기록 완전 삭제
                  </Text>
                  {purgingId === rel.id ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Text style={styles.chevron}>›</Text>
                  )}
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}

        <Card elevation="sm" style={styles.menu}>
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={() => navigation.navigate('Settings')}
          >
            <Text style={styles.menuText}>설정</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={onLogout}>
            <Text style={styles.menuText}>로그아웃</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </Card>

        {/*
          파괴적 액션은 별도 카드로 분리한다 — 로그아웃 바로 아래 연결 끊기·탈퇴가
          1px 구분선만 두고 붙어 있으면 스크롤 관성 중 오탭 한 번으로 되돌릴 수 없는
          동작에 진입한다. 카드 사이 여백이 완충 지대 역할을 한다.
        */}
        <Card elevation="sm" style={styles.dangerMenu}>
          {couple ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
                onPress={onDisconnectCouple}
                disabled={disconnecting}
              >
                <Text style={[styles.menuText, styles.danger]}>커플 연결 끊기</Text>
                {disconnecting ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.chevron}>›</Text>}
              </Pressable>
              <View style={styles.divider} />
            </>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={onWithdraw}
            disabled={withdrawing}
          >
            <Text style={[styles.menuText, styles.danger]}>회원 탈퇴</Text>
            {withdrawing ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.chevron}>›</Text>}
          </Pressable>
        </Card>

        <Text style={styles.footer}>Dubly · 둘이라서, 두 배로</Text>
      </ScrollView>

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
  profile: { alignItems: 'center', paddingVertical: spacing.xl },
  avatarWrap: { position: 'relative' },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  cameraIcon: { fontSize: 13 },
  name: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.md },
  email: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: spacing.xs },
  badge: { marginTop: spacing.sm, color: colors.secondary, fontWeight: '800' },
  editBtn: { marginTop: spacing.md },
  badgeWrap: { marginTop: spacing.lg },
  editBox: { alignSelf: 'stretch', marginTop: spacing.lg },
  editActions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  bodyCard: { marginTop: spacing.lg, gap: spacing.xs },
  bodyLabel: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  bodyDesc: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  bodyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs, gap: spacing.sm },
  bodyValue: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  fieldLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.sm },
  genderRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  genderChip: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  genderChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  genderChipPressed: { opacity: 0.7 },
  genderText: { color: colors.textSecondary, fontWeight: '700' },
  genderTextActive: { color: colors.primaryDark },
  menu: { marginTop: spacing.lg, padding: 0 },
  // 파괴 액션 카드 — 위쪽 여백을 넓혀 일반 메뉴와 시각적으로 분리한다
  dangerMenu: { marginTop: spacing.xl, padding: 0 },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  pressed: { backgroundColor: colors.surfaceAlt },
  menuText: { fontSize: fontSize.subtitle, color: colors.textPrimary, fontWeight: '600' },
  danger: { color: colors.danger },
  sectionLabel: {
    fontSize: fontSize.caption,
    fontWeight: '800',
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  sectionDesc: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  chevron: { fontSize: 22, color: colors.textTertiary },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  footer: { textAlign: 'center', color: colors.textTertiary, fontSize: fontSize.caption, marginTop: 'auto', paddingTop: spacing.xl },
}));
