/** 홈 = 우리 기록(피드) + 상단 커플 대시보드 (비트윈 스타일)
 *  상단: 배경·D+·커플 프로필(오늘 상태). 그 아래: 통합 타임라인(포스트+운동+식단+맛집). */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
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
import { Avatar } from '../../components/Avatar';
import { DoublyMark } from '../../components/DoublyLogo';
import { Card } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { EmptyState } from '../../components/EmptyState';
import { useAuthStore } from '../../store/authStore';
import { useRelationStore } from '../../store/relationStore';
import { workoutApi } from '../../api/workout';
import { streakApi } from '../../api/streak';
import { feedApi } from '../../api/feed';
import { connectSocket, subscribeCouple, unsubscribeCouple } from '../../api/chatSocket';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel } from '../../utils/date';
import { haptics } from '../../utils/haptics';
import { updateHomeWidget } from '../../widget/updateHomeWidget';
import type { FeedItem, PartnerToday, ReactionSummary, Streak } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'HomeMain'>,
  BottomTabScreenProps<MainTabParamList>
>;

// Ink 히어로 — 데이터(코랄/인디고 아바타 + 바이올렛 겹침)가 돋보이게 절제된 배경
const GRADIENT: [string, string, string] = ['#1B1D3A', '#14162B', '#0D0F22'];
const QUICK_EMOJIS = ['❤️', '🥰', '😆', '👍', '💪'];

function daysTogether(connectedAt?: string | null): number {
  if (!connectedAt) return 0;
  const diff = Date.now() - new Date(connectedAt).getTime();
  return Math.max(1, Math.floor(diff / 86400000) + 1);
}

function timeLabel(occurredAt: string): string {
  const date = relativeDateLabel(occurredAt.slice(0, 10));
  const time = occurredAt.slice(11, 16);
  return time ? `${date} ${time}` : date;
}

function itemKey(item: FeedItem): string {
  return `${item.type}-${item.refId}`;
}

export function HomeScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const { couple, loading, fetchAll, setBackground, setAnniversary } = useRelationStore();

  const [partner, setPartner] = useState<PartnerToday | null>(null);
  const [myStreak, setMyStreak] = useState<Streak | null>(null);
  const [partnerStreak, setPartnerStreak] = useState<Streak | null>(null);
  const [myDone, setMyDone] = useState(false);
  const [annModal, setAnnModal] = useState(false);
  const [annInput, setAnnInput] = useState('');
  const [annSaving, setAnnSaving] = useState(false);

  // 피드
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const feedLoadingRef = useRef(false);

  const connected = !!couple?.partner;
  const bgUrl = couple?.backgroundImageUrl ?? null;
  const dday = daysTogether(couple?.anniversaryDate ?? couple?.connectedAt);

  const refreshStatus = useCallback(() => {
    fetchAll();
    workoutApi.today().then((l) => setMyDone(l.length > 0)).catch(() => setMyDone(false));
    workoutApi.partnerToday().then(setPartner).catch(() => setPartner(null));
    streakApi.me().then(setMyStreak).catch(() => setMyStreak(null));
    streakApi.partner().then(setPartnerStreak).catch(() => setPartnerStreak(null));
  }, [fetchAll]);

  // 홈 위젯 갱신 (Android) — 홈 데이터가 바뀔 때마다 위젯 캐시를 남기고 다시 그린다
  useEffect(() => {
    updateHomeWidget({
      connected,
      anniversaryDate: couple?.anniversaryDate ?? couple?.connectedAt ?? null,
      partnerName: couple?.partner?.name ?? null,
      myStreak: myStreak?.currentCount ?? 0,
      partnerStreak: partnerStreak?.currentCount ?? 0,
      updatedAt: new Date().toISOString(),
    });
  }, [connected, couple, myStreak, partnerStreak]);

  const loadFeed = useCallback(async () => {
    if (feedLoadingRef.current) return;
    feedLoadingRef.current = true;
    setFeedLoading(true);
    try {
      const page = await feedApi.timeline(null);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      // 커플 미연결 등은 조용히 무시 (헤더가 연결 안내를 표시)
      setItems([]);
    } finally {
      feedLoadingRef.current = false;
      setFeedLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (feedLoadingRef.current || !hasMore || !nextCursor) return;
    feedLoadingRef.current = true;
    setLoadingMore(true);
    try {
      const page = await feedApi.timeline(nextCursor);
      setItems((prev) => {
        const seen = new Set(prev.map(itemKey));
        return [...prev, ...page.items.filter((i) => !seen.has(itemKey(i)))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e) {
      toast.error(getErrorMessage(e, '피드를 불러오지 못했어요.'));
    } finally {
      feedLoadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor]);

  const refresh = useCallback(() => {
    refreshStatus();
    loadFeed();
  }, [refreshStatus, loadFeed]);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  // 커플 실시간 이벤트 — 피드/상태 변경 시 자동 새로고침
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
      await setBackground(url);
      toast.success('배경을 변경했어요 ');
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
      toast.success('기념일을 설정했어요 ');
      setAnnModal(false);
    } catch (e) {
      toast.error(getErrorMessage(e, '기념일 설정에 실패했어요.'));
    } finally {
      setAnnSaving(false);
    }
  };

  // ---- 피드 반응/삭제 ----
  const onReact = async (item: FeedItem, emoji: string) => {
    haptics.light();
    try {
      const reactions = await feedApi.react(item.refId, emoji);
      setItems((prev) => prev.map((i) => (itemKey(i) === itemKey(item) ? { ...i, reactions } : i)));
    } catch (e) {
      toast.error(getErrorMessage(e, '반응을 남기지 못했어요.'));
    }
  };

  const onDeletePost = (item: FeedItem) => {
    if (item.type !== 'POST' || !item.mine) return;
    Alert.alert('포스트 삭제', '이 일상 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await feedApi.removePost(item.refId);
            haptics.light();
            setItems((prev) => prev.filter((i) => itemKey(i) !== itemKey(item)));
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const renderReactions = (item: FeedItem) => {
    const summaries = item.reactions ?? [];
    const extra = summaries.map((r) => r.emoji).filter((e) => !QUICK_EMOJIS.includes(e));
    const emojis = [...QUICK_EMOJIS, ...extra];
    const byEmoji = new Map<string, ReactionSummary>(summaries.map((r) => [r.emoji, r]));
    return (
      <View style={styles.reactionRow}>
        {emojis.map((emoji) => {
          const s = byEmoji.get(emoji);
          return (
            <TouchableOpacity
              key={emoji}
              style={[styles.reactionChip, s?.mine && styles.reactionChipMine]}
              activeOpacity={0.7}
              onPress={() => onReact(item, emoji)}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              {s && s.count > 0 ? <Text style={styles.reactionCount}>{s.count}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderItem = ({ item }: { item: FeedItem }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={item.type === 'POST' && item.mine ? 0.8 : 1}
      onLongPress={() => onDeletePost(item)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.author}>{item.mine ? '나' : item.userName}</Text>
        <Text style={styles.time}>{timeLabel(item.occurredAt)}</Text>
      </View>
      {item.title ? <Text style={styles.itemTitle}>{item.title}</Text> : null}
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.photo} resizeMode="cover" />
      ) : null}
      {item.content ? <Text style={styles.content}>{item.content}</Text> : null}
      {item.type === 'POST' ? renderReactions(item) : null}
      {item.type === 'POST' && item.mine ? <Text style={styles.hint}>길게 눌러 삭제</Text> : null}
    </TouchableOpacity>
  );

  // ---- 상단 대시보드 헤더 ----
  const hero = (
    <View>
      <View style={styles.heroWrap}>
        {bgUrl ? (
          <ImageBackground source={{ uri: bgUrl }} style={styles.hero} imageStyle={styles.heroImg}>
            <View style={styles.heroOverlay} />
            {renderHeroContent()}
          </ImageBackground>
        ) : (
          <LinearGradient colors={GRADIENT} style={styles.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            {renderHeroContent()}
          </LinearGradient>
        )}
      </View>

      {connected ? (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.composeBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('FeedCompose')}
          >
            <Text style={styles.composeText}>일상 남기기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.composeBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('DailyQuestion')}
          >
            <Text style={styles.composeText}>오늘의 질문</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.composeBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('CoupleCalendar')}
          >
            <Text style={styles.composeText}>캘린더</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  function renderHeroContent() {
    return (
      <View style={styles.heroContent}>
        <View style={styles.topBar}>
          {connected ? (
            <Pressable style={styles.bgBtn} onPress={onChangeBg}>
              <MaterialCommunityIcons name="image-outline" size={13} color={colors.white} />
              <Text style={styles.bgBtnText}>배경</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable style={styles.profileBtn} onPress={() => navigation.navigate('My')} hitSlop={8}>
            <Avatar name={user?.name} imageUrl={user?.profileImageUrl} size={32} color={colors.primaryDark} />
          </Pressable>
        </View>

        {connected ? (
          <>
            {/* 두 사람이 히어로 — 나=코랄 / 상대=인디고 / 겹침=바이올렛 */}
            <View style={styles.coupleRow}>
              <CoupleProfile name={user?.name ?? '나'} imageUrl={user?.profileImageUrl} done={myDone} color={colors.coral} />
              <DoublyMark size={26} />
              <CoupleProfile
                name={partner?.partnerName ?? couple?.partner?.name ?? '상대방'}
                imageUrl={couple?.partner?.profileImageUrl}
                done={!!partner?.completed}
                color={colors.indigo}
              />
            </View>
            <Pressable style={styles.ddayChip} onPress={openAnnModal}>
              <Text style={styles.ddayChipText}>함께한 지 D+{dday}</Text>
            </Pressable>
            <Text style={styles.myStreak}>내 연속 {myStreak?.currentCount ?? 0}일 · 최고 {myStreak?.maxCount ?? 0}일</Text>
          </>
        ) : (
          <View style={styles.connectWrap}>
            <MaterialCommunityIcons
              name="account-multiple-plus-outline"
              size={40}
              color={colors.white}
              style={styles.connectEmoji}
            />
            <Text style={styles.connectTitle}>커플을 연결해보세요</Text>
            <Text style={styles.connectDesc}>초대코드로 연결하면 우리의 기록이 시작돼요.</Text>
            <TouchableOpacity style={styles.connectBtn} onPress={() => navigation.navigate('CoupleConnect')}>
              <Text style={styles.connectBtnText}>커플 연결하기</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={connected ? items : []}
        keyExtractor={itemKey}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshing={loading || feedLoading}
        onRefresh={refresh}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={renderItem}
        ListHeaderComponent={hero}
        ListEmptyComponent={
          feedLoading ? null : connected ? (
            <EmptyState
              icon="timeline-text-outline"
              title="아직 기록이 없어요"
              description={'운동·식단·맛집을 기록하거나\n첫 일상을 남겨보세요!'}
            />
          ) : (
            /* 미연결 첫인상 — 연결 카드 아래가 텅 비어 보이지 않게, 혼자서도
               시작할 수 있는 행동을 안내한다 (FAB 액션시트와 같은 목적지) */
            <View style={styles.soloGuide}>
              <Text style={styles.soloTitle}>연결을 기다리는 동안, 혼자서도 시작할 수 있어요</Text>
              <Card elevation="sm" style={styles.soloCard}>
                {(
                  [
                    { icon: 'dumbbell', label: '운동 기록하기', desc: '오늘 운동을 남기면 스트릭이 시작돼요', go: () => navigation.navigate('Workout', { screen: 'WorkoutRecord' }) },
                    { icon: 'silverware-fork-knife', label: '식단 기록하기', desc: '사진이나 글로 적으면 AI가 칼로리를 계산해요', go: () => navigation.navigate('Workout', { screen: 'DietRecord' }) },
                    { icon: 'map-marker-plus-outline', label: '가고 싶은 맛집 저장', desc: '나중에 둘이 함께 갈 곳을 미리 담아두세요', go: () => navigation.navigate('Place', { screen: 'PlaceAdd' }) },
                  ] as const
                ).map((a, i, arr) => (
                  <React.Fragment key={a.label}>
                    <Pressable
                      style={({ pressed }) => [styles.soloItem, pressed && styles.soloPressed]}
                      onPress={a.go}
                    >
                      <View style={styles.soloIcon}>
                        <MaterialCommunityIcons name={a.icon} size={22} color={colors.primary} />
                      </View>
                      <View style={styles.soloBody}>
                        <Text style={styles.soloLabel}>{a.label}</Text>
                        <Text style={styles.soloDesc}>{a.desc}</Text>
                      </View>
                      <Text style={styles.soloChevron}>›</Text>
                    </Pressable>
                    {i < arr.length - 1 ? <View style={styles.soloDivider} /> : null}
                  </React.Fragment>
                ))}
              </Card>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={styles.loadMore} color={colors.primary} /> : null
        }
      />

      {/* 기념일 설정 모달 */}
      <Modal visible={annModal} transparent animationType="fade" onRequestClose={() => setAnnModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAnnModal(false)}>
          <Pressable>
            <Card elevation="md" style={styles.modalCard}>
              <Text style={styles.modalTitle}>커플 기념일</Text>
              <Text style={styles.modalDesc}>D+ 카운터의 기준 날짜를 설정해요.</Text>
              <TextField
                value={annInput}
                onChangeText={setAnnInput}
                placeholder="YYYY-MM-DD (예: 2024-02-14)"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setAnnModal(false)}>
                  <Text style={styles.modalCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={onSaveAnniversary} disabled={annSaving}>
                  <Text style={styles.modalSaveText}>{annSaving ? '저장 중…' : '저장'}</Text>
                </TouchableOpacity>
              </View>
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function CoupleProfile({ name, imageUrl, done, color }: { name: string; imageUrl?: string | null; done: boolean; color: string }) {
  return (
    <View style={styles.profile}>
      <View style={[styles.avatarRing, { borderColor: color }]}>
        <Avatar name={name} imageUrl={imageUrl} size={60} color={color} />
        {done ? (
          <View style={[styles.doneBadge, { backgroundColor: color }]}>
            <Text style={styles.doneCheck}>✓</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.profileName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  // 히어로
  heroWrap: { marginTop: spacing.sm, borderRadius: radius.xl, overflow: 'hidden' },
  hero: { minHeight: 220 },
  heroImg: { borderRadius: radius.xl },
  heroOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  heroContent: { padding: spacing.lg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profileBtn: { borderRadius: radius.pill, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  bgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  bgBtnText: { color: colors.white, fontSize: fontSize.caption, fontWeight: '700' },
  ddayWrap: { alignItems: 'center', marginTop: spacing.md },
  ddayLabel: { color: 'rgba(255,255,255,0.9)', fontSize: fontSize.caption, fontWeight: '600' },
  dday: {
    color: colors.white,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 2 },
  },
  coupleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, gap: spacing.md },
  profile: { alignItems: 'center', width: 90 },
  avatarRing: { borderWidth: 2, borderRadius: 999, padding: 2 },
  profileName: { color: colors.white, fontSize: fontSize.body, fontWeight: '800', marginTop: spacing.xs },
  doneBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.ink,
  },
  doneCheck: { color: colors.white, fontWeight: '800', fontSize: 12 },
  ddayChip: {
    alignSelf: 'center',
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  ddayChipText: { color: 'rgba(255,255,255,0.92)', fontSize: fontSize.caption, fontWeight: '700' },
  myStreak: { color: 'rgba(255,255,255,0.92)', textAlign: 'center', marginTop: spacing.md, fontSize: fontSize.caption, fontWeight: '600' },

  connectWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  connectEmoji: { fontSize: 44 },
  connectTitle: { color: colors.white, fontSize: fontSize.title, fontWeight: '800', marginTop: spacing.sm },
  connectDesc: { color: 'rgba(255,255,255,0.92)', fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.xs },
  connectBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    minHeight: 44, // 터치 타깃 — 텍스트+패딩만으론 36px
    justifyContent: 'center',
  },
  connectBtnText: { color: colors.primaryDark, fontWeight: '800', fontSize: fontSize.body },

  // 미연결 첫인상 — 혼자서도 시작할 수 있는 행동 안내
  soloGuide: { marginTop: spacing.lg },
  soloTitle: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  soloCard: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  soloItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 44 },
  soloPressed: { opacity: 0.6 },
  soloIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloBody: { flex: 1 },
  soloLabel: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  soloDesc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  soloChevron: { fontSize: fontSize.title, color: colors.textMuted, fontWeight: '700' },
  soloDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  composeBtn: {
    flex: 1,
    backgroundColor: colors.primaryBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  composeText: { color: colors.primary, fontWeight: '800', fontSize: fontSize.body },

  // 피드 카드
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  time: { fontSize: fontSize.caption, color: colors.textMuted },
  itemTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.xs },
  photo: { width: '100%', height: 200, borderRadius: radius.md, marginTop: spacing.sm },
  content: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: spacing.sm, lineHeight: 21 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  reactionChipMine: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  reactionEmoji: { fontSize: fontSize.body },
  reactionCount: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  hint: { fontSize: 10, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'right' },
  loadMore: { paddingVertical: spacing.md },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.xl },
  modalCard: { gap: spacing.xs },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  modalDesc: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  modalCancel: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  modalCancelText: { color: colors.textSecondary, fontWeight: '700' },
  modalSave: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary },
  modalSaveText: { color: colors.white, fontWeight: '800' },
});
