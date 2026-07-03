/** 홈 — 비트윈 스타일 커플 메인 (배경 · D+ 카운터 · 커플 프로필 · 오늘 운동 상태) */
import React, { useCallback, useState } from 'react';
import {
  ImageBackground,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList, MainTabParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { useAuthStore } from '../../store/authStore';
import { useRelationStore } from '../../store/relationStore';
import { workoutApi } from '../../api/workout';
import { dietApi } from '../../api/diet';
import { streakApi } from '../../api/streak';
import { connectSocket, subscribeCouple, unsubscribeCouple } from '../../api/chatSocket';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import type { PartnerToday, Streak } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'HomeMain'>,
  BottomTabScreenProps<MainTabParamList>
>;

// 커플 히어로 그라데이션 — couple(코랄) 톤으로 리파인
const GRADIENT: [string, string, string] = ['#FF9E9E', '#FF8080', '#E86A6A'];

function daysTogether(connectedAt?: string | null): number {
  if (!connectedAt) return 0;
  const diff = Date.now() - new Date(connectedAt).getTime();
  return Math.max(1, Math.floor(diff / 86400000) + 1);
}

export function HomeScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const { couple, loading, fetchAll, setBackground, setAnniversary } = useRelationStore();
  const [partner, setPartner] = useState<PartnerToday | null>(null);
  const [myStreak, setMyStreak] = useState<Streak | null>(null);
  const [coupleStreak, setCoupleStreak] = useState<Streak | null>(null);
  const [myDone, setMyDone] = useState(false);
  const [myMealDone, setMyMealDone] = useState(false);
  const [partnerMeal, setPartnerMeal] = useState<PartnerToday | null>(null);
  const [annModal, setAnnModal] = useState(false);
  const [annInput, setAnnInput] = useState('');
  const [annSaving, setAnnSaving] = useState(false);
  const bgUrl = couple?.backgroundImageUrl ?? null;

  const refresh = useCallback(() => {
    fetchAll();
    workoutApi.today().then((l) => setMyDone(l.length > 0)).catch(() => setMyDone(false));
    workoutApi.partnerToday().then(setPartner).catch(() => setPartner(null));
    dietApi.today().then((l) => setMyMealDone(l.length > 0)).catch(() => setMyMealDone(false));
    dietApi.partnerToday().then(setPartnerMeal).catch(() => setPartnerMeal(null));
    streakApi.me().then(setMyStreak).catch(() => setMyStreak(null));
    streakApi.couple().then(setCoupleStreak).catch(() => setCoupleStreak(null));
  }, [fetchAll]);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  // 커플 실시간 이벤트 구독 — 배경/기념일/상대방 운동 변경 시 자동 새로고침
  const relationId = couple?.id;
  useFocusEffect(
    useCallback(() => {
      if (!relationId) return;
      let active = true;
      connectSocket()
        .then(() => {
          if (active) subscribeCouple(relationId, () => refresh());
        })
        .catch(() => undefined);
      return () => {
        active = false;
        unsubscribeCouple(relationId);
      };
    }, [relationId, refresh]),
  );

  const onChangeBg = async () => {
    try {
      const uri = await pickImage();
      if (!uri) return;
      const url = await uploadImage(uri);
      await setBackground(url); // 커플 공유 배경 (양쪽에 반영)
      toast.success('배경을 변경했어요 🖼️');
    } catch (e) {
      toast.error(getErrorMessage(e, '배경 변경에 실패했어요.'));
    }
  };

  const openAnnModal = () => {
    setAnnInput((couple?.anniversaryDate ?? couple?.connectedAt ?? '').slice(0, 10));
    setAnnModal(true);
  };

  const onSaveAnniversary = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(annInput)) {
      toast.error('YYYY-MM-DD 형식으로 입력해주세요.');
      return;
    }
    setAnnSaving(true);
    try {
      await setAnniversary(annInput);
      toast.success('기념일을 설정했어요 💖');
      setAnnModal(false);
    } catch (e) {
      toast.error(getErrorMessage(e, '기념일 설정에 실패했어요.'));
    } finally {
      setAnnSaving(false);
    }
  };

  const connected = !!couple?.partner;
  // 기념일이 있으면 그 날 기준, 없으면 커플 연결일 기준
  const dday = daysTogether(couple?.anniversaryDate ?? couple?.connectedAt);

  const content = (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.white} />}
      >
        {/* 상단: 배경 변경 (커플 연결 시) */}
        {connected ? (
          <View style={styles.topBar}>
            <Pressable style={styles.bgBtn} onPress={onChangeBg}>
              <MaterialCommunityIcons name="image-outline" size={14} color={colors.white} />
              <Text style={styles.bgBtnText}>배경</Text>
            </Pressable>
          </View>
        ) : null}

        {connected ? (
          <>
            {/* D+ 카운터 (탭하면 기념일 설정) */}
            <Pressable style={styles.ddayWrap} onPress={openAnnModal}>
              <Text style={styles.ddayLabel}>
                {couple?.anniversaryDate ? '기념일부터' : '함께한 지'} ✏️
              </Text>
              <Text style={styles.dday}>D+{dday}</Text>
              <Text style={styles.cheer}>오늘도 함께라서 더 건강해요 💪</Text>
            </Pressable>

            {/* 커플 프로필 두 개 */}
            <View style={styles.coupleRow}>
              <CoupleProfile name={user?.name ?? '나'} imageUrl={user?.profileImageUrl} done={myDone} />
              <Text style={styles.heart}>❤️</Text>
              <CoupleProfile name={partner?.partnerName ?? couple?.partner?.name ?? '상대방'} imageUrl={couple?.partner?.profileImageUrl} done={!!partner?.completed} />
            </View>

            {/* 커플 스트릭 */}
            {coupleStreak && coupleStreak.currentCount > 0 ? (
              <View style={styles.streakChip}>
                <Text style={styles.streakChipText}>🔥 함께 {coupleStreak.currentCount}일째 운동 중!</Text>
              </View>
            ) : (
              <View style={styles.streakChip}>
                <Text style={styles.streakChipText}>오늘 둘 다 운동하면 커플 스트릭 시작 ✨</Text>
              </View>
            )}

            {/* 내 연속 */}
            <Text style={styles.myStreak}>🔥 내 연속 {myStreak?.currentCount ?? 0}일 · 최고 {myStreak?.maxCount ?? 0}일</Text>

            {/* 우리 맛집 지도 */}
            <Pressable
              style={[styles.mealChip, styles.chipRow]}
              onPress={() => navigation.navigate('PlaceMap')}
            >
              <MaterialCommunityIcons name="map-marker-outline" size={15} color={colors.white} />
              <Text style={styles.mealChipText}>우리 맛집 지도</Text>
            </Pressable>

            {/* 오늘 식단 상태 */}
            <Pressable
              style={[styles.mealChip, styles.chipRow]}
              onPress={() => navigation.navigate('Diet', { screen: 'DietMain' })}
            >
              <MaterialCommunityIcons name="silverware-fork-knife" size={15} color={colors.white} />
              <Text style={styles.mealChipText}>
                오늘 식단 · 나 {myMealDone ? '✓' : '–'} / {partnerMeal?.partnerName ?? '상대'}{' '}
                {partnerMeal?.completed ? '✓' : '–'}
              </Text>
            </Pressable>

            {/* 빠른 기록 */}
            <View style={styles.quickRow}>
              <Button
                title={myDone ? '운동 더 하기' : '＋ 운동 완료!'}
                variant={myDone ? 'soft' : 'secondary'}
                onPress={() => navigation.navigate('Workout', { screen: 'WorkoutRecord' })}
                style={styles.quickBtn}
              />
              <Button
                title={myMealDone ? '식단 더 하기' : '＋ 식단 기록!'}
                variant="soft"
                onPress={() => navigation.navigate('Diet', { screen: 'DietRecord' })}
                style={styles.quickBtn}
              />
            </View>
          </>
        ) : (
          <View style={styles.connectWrap}>
            <Text style={styles.connectEmoji}>💌</Text>
            <Text style={styles.connectTitle}>커플을 연결해보세요</Text>
            <Text style={styles.connectDesc}>초대코드를 만들거나 상대방 코드를 입력해{'\n'}함께 운동을 응원할 수 있어요.</Text>
            <Button title="커플 연결하기" variant="soft" onPress={() => navigation.navigate('CoupleConnect')} style={styles.connectBtn} />
          </View>
        )}
      </ScrollView>

      {/* 기념일 설정 모달 */}
      <Modal visible={annModal} transparent animationType="fade" onRequestClose={() => setAnnModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAnnModal(false)}>
          <Pressable>
            <Card elevation="md" style={styles.modalCard}>
              <Text style={styles.modalTitle}>💖 커플 기념일</Text>
              <Text style={styles.modalDesc}>D+ 카운터의 기준 날짜를 설정해요.</Text>
              <TextField
                value={annInput}
                onChangeText={setAnnInput}
                placeholder="YYYY-MM-DD (예: 2024-02-14)"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
              <View style={styles.modalActions}>
                <Button title="취소" variant="ghost" size="md" onPress={() => setAnnModal(false)} style={styles.modalBtn} />
                <Button title="저장" size="md" onPress={onSaveAnniversary} loading={annSaving} style={styles.modalBtn} />
              </View>
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );

  if (bgUrl) {
    return (
      <ImageBackground source={{ uri: bgUrl }} style={styles.bg} resizeMode="cover">
        <View style={styles.overlay} />
        {content}
      </ImageBackground>
    );
  }
  return (
    <LinearGradient colors={GRADIENT} style={styles.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      {content}
    </LinearGradient>
  );
}

function CoupleProfile({ name, imageUrl, done }: { name: string; imageUrl?: string | null; done: boolean }) {
  return (
    <View style={styles.profile}>
      <View>
        <Avatar name={name} imageUrl={imageUrl} size={88} color={colors.primaryDark} />
        {done ? (
          <View style={styles.doneBadge}>
            <Text style={styles.doneCheck}>✓</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.profileName} numberOfLines={1}>{name}</Text>
      <Text style={[styles.profileStatus, done && styles.profileStatusDone]}>
        {done ? '운동 완료!' : '운동 전'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  safe: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.lg },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  bgBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  chipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  bgBtnText: { color: colors.white, fontSize: fontSize.caption, fontWeight: '700' },

  ddayWrap: { alignItems: 'center', marginTop: spacing.xl },
  ddayLabel: { color: 'rgba(255,255,255,0.9)', fontSize: fontSize.body, fontWeight: '600' },
  dday: { color: colors.white, fontSize: 56, fontWeight: '800', letterSpacing: -1, textShadowColor: 'rgba(0,0,0,0.15)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
  cheer: { color: 'rgba(255,255,255,0.95)', fontSize: fontSize.body, marginTop: spacing.xs },

  coupleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl, gap: spacing.md },
  heart: { fontSize: 26 },
  profile: { alignItems: 'center', width: 110 },
  profileName: { color: colors.white, fontSize: fontSize.subtitle, fontWeight: '800', marginTop: spacing.sm },
  profileStatus: { color: 'rgba(255,255,255,0.85)', fontSize: fontSize.caption, marginTop: 2, fontWeight: '600' },
  profileStatusDone: { color: '#EAFFF4' },
  doneBadge: { position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  doneCheck: { color: colors.white, fontWeight: '800' },

  streakChip: { alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.xl },
  streakChipText: { color: colors.white, fontWeight: '800', fontSize: fontSize.body },
  myStreak: { color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginTop: spacing.md, fontSize: fontSize.caption, fontWeight: '600' },

  mealChip: { alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.md },
  mealChipText: { color: colors.white, fontWeight: '700', fontSize: fontSize.caption },

  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 'auto' },
  quickBtn: { flex: 1 },

  connectWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: spacing.xxl },
  connectEmoji: { fontSize: 56 },
  connectTitle: { color: colors.white, fontSize: fontSize.title, fontWeight: '800', marginTop: spacing.md },
  connectDesc: { color: 'rgba(255,255,255,0.92)', fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.sm, lineHeight: 21 },
  connectBtn: { marginTop: spacing.lg, alignSelf: 'stretch' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.xl },
  modalCard: { gap: spacing.xs },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  modalDesc: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  modalBtn: { flex: 1 },
});
