/** MY — 미니멀·발랄. 프로필(이름 편집) + 로그아웃/탈퇴 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { BadgeCard } from '../../components/BadgeCard';
import { LevelCard } from '../../components/LevelCard';
import { WeeklyRecapCard } from '../../components/WeeklyRecapCard';
import { useAuthStore } from '../../store/authStore';
import { useRelationStore } from '../../store/relationStore';
import { streakApi } from '../../api/streak';
import { summaryApi } from '../../api/summary';
import { publishEnsuringConnection } from '../../api/chatSocket';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { colors, fontSize, spacing } from '../../constants/theme';
import type { UserLevel, WeeklyRecap } from '../../types';

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
  const [disconnecting, setDisconnecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [maxStreak, setMaxStreak] = useState(0);
  const [maxMealStreak, setMaxMealStreak] = useState(0);
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [level, setLevel] = useState<UserLevel | null>(null);
  const [sharing, setSharing] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      streakApi.me().then((s) => setMaxStreak(s.maxCount)).catch(() => setMaxStreak(0));
      streakApi.mealMe().then((s) => setMaxMealStreak(s.maxCount)).catch(() => setMaxMealStreak(0));
      summaryApi.weeklyRecap().then(setRecap).catch(() => setRecap(null));
      summaryApi.level().then(setLevel).catch(() => setLevel(null));
      fetchRelations().catch(() => {});
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

  const onChangePhoto = async () => {
    try {
      const uri = await pickImage();
      if (!uri) return;
      setPhotoUploading(true);
      const url = await uploadImage(uri);
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

  const onWithdraw = () => {
    Alert.alert('회원 탈퇴', '탈퇴하면 연결된 관계도 해제됩니다. 계속할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '탈퇴',
        style: 'destructive',
        onPress: async () => {
          try {
            await withdraw();
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>MY</Text>

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

        {level ? (
          <View style={styles.badgeWrap}>
            <LevelCard level={level} />
          </View>
        ) : null}

        {recap ? (
          <View style={styles.badgeWrap}>
            <WeeklyRecapCard recap={recap} onShare={onShareRecap} sharing={sharing} />
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

        <Card elevation="sm" style={styles.menu}>
          <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={onLogout}>
            <Text style={styles.menuText}>로그아웃</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          {couple ? (
            <>
              <View style={styles.divider} />
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
                onPress={onDisconnectCouple}
                disabled={disconnecting}
              >
                <Text style={[styles.menuText, styles.danger]}>커플 연결 끊기</Text>
                {disconnecting ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.chevron}>›</Text>}
              </Pressable>
            </>
          ) : null}
          <View style={styles.divider} />
          <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]} onPress={onWithdraw}>
            <Text style={[styles.menuText, styles.danger]}>회원 탈퇴</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </Card>

        <Text style={styles.footer}>Doubly · 둘이라서, 두 배로</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, flexGrow: 1 },
  title: { fontSize: fontSize.heading, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, marginBottom: spacing.lg },
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
  menu: { marginTop: spacing.lg, padding: 0 },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  pressed: { backgroundColor: colors.surfaceAlt },
  menuText: { fontSize: fontSize.subtitle, color: colors.textPrimary, fontWeight: '600' },
  danger: { color: colors.danger },
  chevron: { fontSize: 22, color: colors.textTertiary },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  footer: { textAlign: 'center', color: colors.textTertiary, fontSize: fontSize.caption, marginTop: 'auto', paddingTop: spacing.xl },
});
