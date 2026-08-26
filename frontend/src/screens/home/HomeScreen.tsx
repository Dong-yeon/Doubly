/**
 * 홈 — 배경 사진 위의 "우리" 화면. <b>스크롤이 없다.</b>
 *
 * <p>예전에는 이 화면이 통합 타임라인까지 겸했다. 배경을 벽지처럼 전체에 깔아뒀는데,
 * 기록이 쌓일수록 그 위로 카드가 계속 얹혀 정작 사진이 파묻혔다. 그래서 목록은
 * {@link FeedTimelineScreen}(우리 기록)으로 옮기고, 홈은 한 화면에 고정했다.
 *
 * <p>구성은 위에서부터 — 상단 바(배경·프로필) / D+ 히어로(남는 공간 가운데) /
 * 최근 기록 한 줄 / 바로가기. 히어로가 {@code flex: 1} 을 먹으므로 화면이
 * 크든 작든 아래 두 줄은 항상 바닥에 붙고 스크롤이 생기지 않는다.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '../../components/Icon';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList, MainTabParamList } from '../../navigation/types';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { DateField } from '../../components/DateField';
import { CoupleHero } from './components/CoupleHero';
import { QuickActions } from './components/QuickActions';
import { MemoryPeek } from './components/MemoryPeek';
import { TripPeek, isTripLive, isTripOngoing, pickHomeTrip } from './components/TripPeek';
import { LockedCard } from '../../components/LockedCard';
import { TouchGesturePicker } from '../../components/TouchGesturePicker';
import { MoodPicker } from '../../components/MoodPicker';
import { useAuthStore } from '../../store/authStore';
import { usePlanStore } from '../../store/planStore';
import { useRelationStore } from '../../store/relationStore';
import { workoutApi } from '../../api/workout';
import { analyticsApi } from '../../api/analytics';
import { dietApi } from '../../api/diet';
import { streakApi } from '../../api/streak';
import { feedApi } from '../../api/feed';
import { chatApi } from '../../api/chat';
import { moodApi } from '../../api/mood';
import { tripApi } from '../../api/trip';
import { feedTimeLabel } from '../feed/FeedTimelineScreen';
import {
  connectSocket,
  publishEnsuringConnection,
  subscribeCouple,
  unsubscribeCouple,
} from '../../api/chatSocket';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { daysSince } from '../../utils/date';
import { haptics } from '../../utils/haptics';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { getErrorMessage } from '../../utils/error';
import { Alert } from '../../utils/alert';
import { errorCodeOf } from '../../api/client';
import { updateHomeWidget } from '../../widget/updateHomeWidget';
import { loadWidgetData } from '../../widget/widgetData';
import { touchGestureOf } from '../../constants/touchGestures';
import { playTouchGesture } from '../../utils/haptics';
import type { FeedItem, Memories, MoodResponse, PartnerToday, Streak, TouchGestureCode, Trip } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { isDarkMode } from '../../theme';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'HomeMain'>,
  BottomTabScreenProps<MainTabParamList>
>;

/**
 * 배경 사진이 없을 때의 기본 벽지 — 테마를 따른다.
 */
const gradient = (): [string, string, string] =>
  isDarkMode()
    ? ['#262823', '#1E201C', '#151713']
    : ['#FFFFFF', '#FAFAF9', '#F1F2F0'];

/**
 * 배경 사진 위 스크림 — 사진이 밝든 어둡든 그 위의 글씨가 읽혀야 한다.
 *
 * <p>예전에는 <b>검정 기반 + 흰 글씨</b> 고정이었다. 안전했지만 앱에서 홈만 늘 어두워
 * 커플앱치고 무거웠다. 지금은 스크림도 테마를 따르고, 글씨는 테마색을 그대로 쓴다 —
 * 라이트에서는 크림 스크림 + 어두운 글씨(= 밝은 홈), 다크에서는 반대다.
 *
 * <p><b>⚠️ 스크림과 글씨의 테마가 어긋나면 안 된다.</b> 스크림만 크림으로 고정했다가
 * 다크 모드에서 밝은 글씨가 크림 위에 올라가 <b>대비 1.3:1</b> 로 안 읽힌 적이 있다.
 * 값을 만질 때는 반드시 두 테마 모두에서 확인할 것.
 *
 * <p><b>0.84 아래로 내리지 말 것.</b> 최악(순흑 사진 · 라이트)에서도 보조 텍스트가
 * AA(4.5)를 넘겨야 한다. 맨 위는 topBar(자체 배경이 있는 칩·아바타)만 있어 조금 옅어도 된다.
 */
const scrim = (): [string, string, string] =>
  isDarkMode()
    // 다크는 하한이 더 높아야 한다 — 순백 사진 위 0.84 면 보조 텍스트가 4.35 로 미달이다
    ? ['rgba(30,32,28,0.88)', 'rgba(30,32,28,0.93)', 'rgba(30,32,28,0.97)']
    : ['rgba(255,255,255,0.84)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.97)'];

/** 열에 들어갈 최근 기록 한 줄 — 종류마다 제목/본문 중 있는 쪽을 쓴다 */
function recordLabel(item: FeedItem | null): string | null {
  if (!item) return null;
  return item.content || item.title || '기록을 남겼어요';
}

/**
 * 위젯 캐시의 숫자를 화면이 쓰는 스트릭 모양으로 감싼다.
 *
 * <p>캐시에는 연속일 수만 있다(위젯이 그 이상을 그리지 않는다). 최고 기록은 알 수 없어
 * 현재 값으로 둔다 — 홈 카드가 읽는 건 currentCount 뿐이고, 서버 응답이 오면 통째로
 * 교체되므로 이 값이 오래 남지 않는다.
 */
function cachedStreak(currentCount: number): Streak {
  return { streakType: 'PERSONAL', currentCount, maxCount: currentCount, lastWorkoutDate: null };
}

export function HomeScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const { couple, loading: relationLoading, fetchAll, setBackground, setAnniversary } = useRelationStore();
  // 표시용 판정 — 모르면 열린 것으로 본다(planStore 주석 참고). 최종 판정은 서버가 한다.
  const canUse = usePlanStore((s) => s.can);
  const showUpgrade = usePlanStore((s) => s.showUpgrade);

  const [partner, setPartner] = useState<PartnerToday | null>(null);
  const [myStreak, setMyStreak] = useState<Streak | null>(null);
  const [partnerStreak, setPartnerStreak] = useState<Streak | null>(null);
  // 오늘의 운동·식단 — 나/상대 각각. 히어로의 두 사람 아래에 나란히 표시된다
  const [myWorkoutDone, setMyWorkoutDone] = useState(false);
  const [myMealDone, setMyMealDone] = useState(false);
  const [partnerMeal, setPartnerMeal] = useState<PartnerToday | null>(null);
  /*
   * 최근 기록 — 좌우 열이 <b>각자의</b> 마지막 기록을 보여주므로 두 건이 필요하다.
   * 타임라인은 시간순 한 줄이라 사람별로 나눠 받을 수 없어, 한 페이지를 받아
   * mine 으로 갈라 각각 첫 건만 쓴다.
   */
  const [myLatest, setMyLatest] = useState<FeedItem | null>(null);
  const [partnerLatest, setPartnerLatest] = useState<FeedItem | null>(null);
  // 작년 오늘 — 있는 날에만 최근 기록 자리를 대신 차지한다 (PLAN.md Memories)
  const [memories, setMemories] = useState<Memories | null>(null);
  // 다가오는/진행 중 여행 — 있는 기간에만 조건부 한 줄 슬롯에 D-day 카드를 띄운다 (PLAN.md Trip)
  const [homeTrip, setHomeTrip] = useState<Trip | null>(null);

  const [annModal, setAnnModal] = useState(false);
  const [annInput, setAnnInput] = useState('');
  const [annSaving, setAnnSaving] = useState(false);
  // 가상 터치 — 채팅방을 열지 않고도 보낼 수 있는 진입점(PLAN.md "가상 터치" 참고)
  const [showTouchPicker, setShowTouchPicker] = useState(false);
  /*
   * 무드 상태 — 나/상대 지금 기분(PLAN.md "무드 상태" 참고). 아바타 배지로 표시하고,
   * 설정하는 진입점도 여기 topBar 에 둔다(아래 topBar 참고).
   *
   * 예전엔 설정 진입점이 ChatRoomScreen 에 있었다 — "대화창에 보내는" 액션(스티커·
   * 터치·사진)도 아니고 대화 로그에 남지도 않는데 그 트레이에 같이 있어 카테고리가
   * 안 맞았다. 그렇다고 QuickActions 에 넣기도 어렵다: 이 화면은 세로 여백이
   * 빠듯하고(파일 상단 주석) QuickActions 는 이미 6개라 항목을 더 넣으면 360dp 에서
   * 46px 고정폭 아이콘이 겹친다(312px÷7≈44.6px < 46px). topBar 좌측은 예전 "배경"
   * 버튼이 빠지고 비어 있던 자리라 폭 예산 걱정 없이 새 진입점을 넣을 수 있었다.
   */
  const [mood, setMood] = useState<MoodResponse | null>(null);
  const [showMoodPicker, setShowMoodPicker] = useState(false);

  // relationStore 의 fetchAll 이 아직 안 끝났으면 couple 이 null 이어도 "미연결"이
  // 아니라 "아직 모름"이다 — 로딩 중엔 연결된 것으로 간주해 연결 안내 화면이
  // 잠깐 스쳤다 사라지는 깜빡임(P2-13)을 막는다. 로딩이 끝나면 실제 값을 따른다.
  const connected = relationLoading ? true : !!couple?.partner;
  const bgUrl = couple?.backgroundImageUrl ?? null;
  const dday = daysSince(couple?.anniversaryDate ?? couple?.connectedAt);

  /*
   * 오프라인 안내는 한 번만 — 홈은 포커스마다 refresh 가 돌고 그 안에서 여러 요청이
   * 각각 실패하므로, 안내를 그대로 흘리면 지하철 한 정거장에 토스트가 열 번 뜬다.
   */
  const offlineNoticeShown = useRef(false);
  const noteOffline = useCallback(() => {
    if (offlineNoticeShown.current) return;
    offlineNoticeShown.current = true;
    toast.info('연결이 불안정해요. 마지막으로 본 기록을 보여주고 있어요.');
  }, []);

  const refresh = useCallback(() => {
    // fetchAll 은 실패해도 store 의 기존 couple/relations 를 그대로 둔다(재시도 여지를 위해
    // 지우지 않음) — 여기서 잡아주지 않으면 catch 가 없어 unhandled rejection 이 된다(P1-10).
    fetchAll().catch(noteOffline);
    workoutApi.today().then((l) => setMyWorkoutDone(l.length > 0)).catch(() => setMyWorkoutDone(false));
    workoutApi.partnerToday().then(setPartner).catch(() => setPartner(null));
    dietApi.today().then((l) => setMyMealDone(l.length > 0)).catch(() => setMyMealDone(false));
    dietApi.partnerToday().then(setPartnerMeal).catch(() => setPartnerMeal(null));
    /*
     * 실패해도 스트릭 상태는 건드리지 않는다 — null 로 덮으면 화면이 0일로 보이고
     * (?? 0 폴백) 아래 위젯 캐시까지 0으로 구워버린다. 직전에 성공했던 값을 유지한다.
     * 기록 앱에서 숫자가 갑자기 0이 되는 건 "헬스장 지하에서 스트릭이 사라졌다"로 읽히고,
     * 그 한 번이 이 앱의 숫자 전체에 대한 신뢰를 무너뜨린다.
     */
    streakApi.me().then(setMyStreak).catch(noteOffline);
    streakApi.partner().then(setPartnerStreak).catch(() => {});
    // 무드는 커플 이벤트(MOOD)가 오면 이 refresh() 가 그대로 다시 불려 최신값을 반영한다
    // — 가상 터치와 달리 즉시 반응(진동)이 필요 없어 별도 이벤트 분기가 필요 없다
    moodApi.current().then(setMood).catch(() => setMood(null));
    /*
     * 좌우 열이 각자의 마지막 기록을 보여주므로 <b>두 사람 몫</b>이 필요하다.
     * 12건이면 한쪽이 연속으로 기록한 날에도 반대쪽 한 건이 대개 들어온다 —
     * 그래도 없으면 그 열은 "아직 기록이 없어요" 로 둔다(추가 호출은 하지 않는다).
     * (커플 미연결이면 피드가 404 다 — 조용히 비운다)
     */
    feedApi
      .timeline(null, 12)
      .then((page) => {
        setMyLatest(page.items.find((i) => i.mine) ?? null);
        setPartnerLatest(page.items.find((i) => !i.mine) ?? null);
      })
      .catch(() => {
        setMyLatest(null);
        setPartnerLatest(null);
      });
    // 추억은 대부분의 날에 비어 있다 — 없으면 최근 기록이 그대로 남는다
    feedApi
      .memories()
      // 잠긴 응답(locked)도 들고 있는다 — 빈 결과와 구분해서 잠금 카드를 그려야 한다
      .then((res) => setMemories(res.locked || res.groups.length > 0 ? res : null))
      .catch(() => setMemories(null));
    // 여행 — 진행 중 > 가장 가까운 예정 하나만 고른다. 없거나 실패(미연결 404 포함)면 카드도 없다
    tripApi
      .list()
      .then((trips) => setHomeTrip(pickHomeTrip(trips)))
      .catch(() => setHomeTrip(null));
  }, [fetchAll, noteOffline]);

  useFocusEffect(useCallback(() => {
    // 다시 들어올 때는 안내를 한 번 더 받을 수 있어야 한다(계속 오프라인인데 조용하면
    // 왜 숫자가 안 바뀌는지 알 수 없다) — 화면 진입 시점에만 되살린다
    offlineNoticeShown.current = false;
    refresh();
  }, [refresh]));

  /*
   * 첫 진입의 초기값 — 서버 응답을 기다리는 동안(그리고 오프라인이면 계속) 위젯이
   * 남겨 둔 마지막 스냅샷을 보여준다. 없으면 스트릭 자리가 0으로 그려지는데,
   * 그건 "아직 모른다"가 아니라 "끊겼다"로 읽힌다.
   *
   * 서버 값이 도착하면 그쪽이 이긴다 — 여기서는 아직 null 일 때만 채운다.
   */
  useEffect(() => {
    let cancelled = false;
    void loadWidgetData().then((cached) => {
      if (cancelled || !cached) return;
      setMyStreak((prev) => prev ?? cachedStreak(cached.myStreak));
      setPartnerStreak((prev) => prev ?? cachedStreak(cached.partnerStreak));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 최소 이벤트 로깅(README 참고) — 서버가 자체적으로 알 수 없는 "홈 화면 진입"을 여기서만 보낸다.
  // 실패해도 화면에 영향 없게 조용히 삼킨다.
  useFocusEffect(useCallback(() => {
    analyticsApi.log('HOME_VIEWED').catch(() => {});
  }, []));

  // 홈 위젯 갱신 (Android) — 홈 데이터가 바뀔 때마다 위젯 캐시를 남기고 다시 그린다
  useEffect(() => {
    // 아직 한 번도 못 불러온 상태(null)를 0으로 캐시하면, 앱을 안 열어둔 동안
    // 위젯이 계속 "스트릭 0"을 보여준다 — 값을 실제로 알기 전까진 캐시를 건드리지 않는다.
    if (myStreak === null && partnerStreak === null) return;
    updateHomeWidget({
      connected,
      anniversaryDate: couple?.anniversaryDate ?? couple?.connectedAt ?? null,
      partnerName: couple?.partner?.name ?? null,
      myStreak: myStreak?.currentCount ?? 0,
      partnerStreak: partnerStreak?.currentCount ?? 0,
      updatedAt: new Date().toISOString(),
    });
  }, [connected, couple, myStreak, partnerStreak]);

  // 커플 실시간 이벤트 — 상대가 기록하면 바로 반영
  const relationId = couple?.id;

  /*
   * 가상 터치 수신 — CoupleEvent 는 페이로드가 없으므로(다른 이벤트와 동일한 설계) 받으면
   * 최신 터치를 다시 조회해 진동 + 토스트로 알린다. 채팅방을 안 열어도 반응하는 경로다
   * (PLAN.md "가상 터치" 참고).
   */
  const onIncomingTouch = useCallback(() => {
    if (!relationId) return;
    chatApi
      .latestTouch(relationId)
      .then((latest) => {
        if (!latest) return;
        playTouchGesture(latest.gestureType);
        const g = touchGestureOf(latest.gestureType);
        toast.success(`${couple?.partner?.name ?? '상대'}님이 ${g?.label ?? '터치'}를 보냈어요 ${g?.emoji ?? ''}`);
      })
      .catch(() => undefined);
  }, [relationId, couple?.partner?.name]);

  useFocusEffect(
    useCallback(() => {
      if (!relationId) return;
      let active = true;
      connectSocket()
        .then(() => {
          if (!active) return;
          subscribeCouple(relationId, (type) => {
            refresh();
            // 가상 터치는 새로고침 대상이 아니라 즉시 반응(진동) 대상이다
            if (type === 'TOUCH') onIncomingTouch();
          });
        })
        .catch(() => undefined);
      return () => {
        active = false;
        unsubscribeCouple(relationId);
      };
    }, [relationId, refresh, onIncomingTouch]),
  );

  const sendTouch = (code: TouchGestureCode) => {
    if (!relationId) return;
    publishEnsuringConnection(relationId, { messageType: 'TOUCH', content: code }).then((ok) => {
      if (!ok) toast.error('연결이 끊겼어요. 잠시 후 다시 시도해주세요.');
    });
  };

  // moodApi.set 이 갱신된 나/상대 무드를 함께 돌려주므로, 소켓 이벤트를 기다리지 않고
  // 응답으로 바로 반영한다(홈을 나가지 않고 연달아 바꿔도 배지가 즉시 따라온다).
  const sendMood = (emoji: string, message?: string) => {
    moodApi
      .set(emoji, message)
      .then((res) => { setMood(res); haptics.light(); toast.success('무드를 남겼어요'); })
      .catch((e) => toast.error(getErrorMessage(e, '무드를 남기지 못했어요.')));
  };

  /*
   * 배경 바꾸기 — 상단바 버튼과 화면 길게 누르기가 <b>같은 곳으로</b> 들어온다.
   *
   * <p><b>플랜은 사진을 고르기 전에 본다.</b> 예전에는 곧장 갤러리를 열고 Cloudinary
   * 업로드까지 마친 <b>다음</b>에야 서버가 402 를 던졌다 — 무료 사용자는 사진을 고르고
   * 기다린 끝에 거절당하고, 그 사이 <b>아무도 안 쓸 이미지가 이미 올라가</b> 있었다
   * (업로드 한도와 비용은 그대로 나간다). TouchGesturePicker 와 같은 패턴이다: 여기는
   * 우회 방지가 아니라 UX 고, 서버(RelationService)가 최종 판정을 한 번 더 한다.
   *
   * <p>배경이 이미 있으면 바로 갤러리를 열지 않고 먼저 물어본다 — 백엔드는 처음부터
   * "null 이면 배경 해제"를 지원했는데 프론트에 그 경로가 없어, 한 번 정하면 기본
   * 그라데이션으로 되돌릴 방법이 아예 없었다.
   */
  const onBackgroundPress = () => {
    // 길게 누르기는 눌린 순간 아무 신호가 없으면 눌린 줄 모른다 — 제스처부터 받아준다.
    haptics.light();
    if (!canUse('CUSTOM_BACKGROUND')) {
      showUpgrade('커플 배경 꾸미기는 PRO에서 이용할 수 있어요.');
      return;
    }
    if (!bgUrl) {
      void pickBackground();
      return;
    }
    Alert.alert('배경 사진', '홈 배경을 바꾸거나 기본 배경으로 되돌려요.', [
      { text: '사진 선택', onPress: () => void pickBackground() },
      { text: '기본 배경으로', style: 'destructive', onPress: () => void clearBackground() },
      { text: '취소', style: 'cancel' },
    ]);
  };

  /**
   * 402 는 여기서 토스트를 띄우지 않는다 — api/client 가 이미 업그레이드 시트를 열었다.
   * 둘 다 띄우면 같은 사실을 두 번 알리고, 시트 뒤로 토스트가 겹쳐 뜬다.
   */
  const notifyUnless402 = (e: unknown, fallback: string) => {
    const code = errorCodeOf(e);
    if (code === 'PLAN_UPGRADE_REQUIRED' || code === 'PLAN_LIMIT_EXCEEDED') return;
    toast.error(getErrorMessage(e, fallback));
  };

  const pickBackground = async () => {
    try {
      const uri = await pickImage();
      if (!uri) return;
      const url = await runBusy('배경 올리는 중…', () => uploadImage(uri));
      await setBackground(url);
      haptics.success();
      toast.success('배경을 변경했어요 ');
    } catch (e) {
      notifyUnless402(e, '배경 변경에 실패했어요.');
    }
  };

  const clearBackground = async () => {
    try {
      await runBusy('배경 되돌리는 중…', () => setBackground(null));
      haptics.success();
      toast.success('기본 배경으로 되돌렸어요');
    } catch (e) {
      notifyUnless402(e, '배경을 되돌리지 못했어요.');
    }
  };

  const openAnnModal = () => {
    setAnnInput((couple?.anniversaryDate ?? couple?.connectedAt ?? '').slice(0, 10));
    setAnnModal(true);
  };

  const onSaveAnniversary = async () => {
    if (!annInput) {
      toast.error('기념일 날짜를 선택해주세요.');
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

  /*
   * 상단바 — 좌측 무드, 우측 [배경][프로필].
   *
   * <p>예전에는 좌상단 '배경' 버튼을 없애고 <b>배경 화면 길게 누르기</b> 하나만 남겼다.
   * 가장 눈에 띄는 자리를 거의 안 쓰는 유틸리티가 차지한다는 이유였는데, 그러면
   * <b>길게 누를 수 있다는 걸 알 방법이 없다</b> — 안내 문구는 accessibilityLabel 에만
   * 있어서 스크린리더 사용자만 아는 기능이 됐다. 그래서 아이콘 버튼으로 되돌리되,
   * 이번엔 우측에 작게 둔다(무드가 좌측 자리를 이미 쓰고 있다). 길게 누르기는
   * <b>지름길로 그대로 유지</b>한다 — 아래 stage 블록 참고.
   *
   * <p>배경은 커플 공유 자산이라 미연결 상태에서는 버튼도 내린다(백엔드도
   * activeCouple 을 요구한다). 길게 누르기의 disabled 조건과 같은 값을 쓴다.
   */
  const topBar = (
    <View style={styles.topBar}>
      <Pressable
        style={styles.moodBtn}
        onPress={() => setShowMoodPicker(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={mood?.mine ? `지금 기분 ${mood.mine.emoji} — 눌러서 바꾸기` : '지금 기분 남기기'}
      >
        <Text style={styles.moodBtnEmoji}>{mood?.mine?.emoji ?? '🙂'}</Text>
        <Text style={styles.moodBtnText}>{mood?.mine ? '기분 바꾸기' : '기분 남기기'}</Text>
      </Pressable>
      <View style={styles.topBarRight}>
        {connected ? (
          <Pressable
            style={styles.bgBtn}
            onPress={onBackgroundPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={bgUrl ? '배경 사진 변경' : '배경 사진 설정'}
            accessibilityHint="화면을 길게 눌러도 바꿀 수 있어요"
          >
            <MaterialCommunityIcons name="image-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <Pressable
          style={styles.profileBtn}
          onPress={() => navigation.navigate('My')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="내 프로필"
        >
          <Avatar name={user?.name} imageUrl={user?.profileImageUrl} size={32} color={colors.primaryDark} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {/*
        길게 눌러 배경 바꾸기 — 이 Pressable 은 <b>배경 레이어가 아니라 화면 전체의
        조상</b>이어야 한다.

        <p>예전에는 배경 이미지에만 Pressable 을 씌우고 콘텐츠를 그 <b>형제</b>로
        뒀다. RN 의 리스폰더 협상은 터치가 닿은 뷰에서 <b>조상 방향으로만</b> 올라가는데,
        전체를 덮는 SafeAreaView(그리고 그 안의 레이아웃 View 들)가 pointerEvents 를
        열어둔 채 위에 얹혀 있으니 터치가 형제인 배경까지 <b>절대 내려오지 않았다</b> —
        기능은 있는데 아무 데서도 안 눌리는 상태였다.

        <p>조상으로 올리면 그 경로가 뒤집힌다. 버튼(자식 Pressable) 위에서는 자식이
        먼저 리스폰더를 잡아 배경이 안 바뀌고, 빈 공간·글씨처럼 아무도 안 잡는 자리에서만
        여기까지 버블링돼 갤러리가 열린다 — 원하는 동작 그대로다. 아래 기념일 모달의
        backdrop 이 같은 원리를 쓴다(카드 탭이 backdrop 까지 올라가지 않게 안쪽에 빈
        Pressable 을 하나 끼워 둔 것).

        <p><b>모달들은 이 Pressable 밖에 둔다.</b> RN 의 이벤트 버블링은 네이티브 계층이
        아니라 <b>React 트리</b>를 타므로, 안에 넣으면 모달 위 길게 누르기가 여기까지
        올라온다.

        <p><b>accessible 을 false 로 내리는 건 필수다.</b> Pressable 은 그 기본값이 true 라
        화면 전체를 감싸면 iOS VoiceOver 에서 홈 전체가 <b>덩어리 하나</b>로 뭉개진다.
        접근성 진입점은 상단바의 배경 버튼이 맡는다(topBar 주석 참고).
      */}
      <Pressable
        style={styles.stage}
        onLongPress={onBackgroundPress}
        // 배경은 커플 공유 자산이다 — 미연결 상태에서는 리스폰더 경쟁 자체를 없앤다
        // (미연결 화면은 ScrollView 라 제스처가 겹칠 이유를 만들지 않는 편이 낫다).
        disabled={!connected}
        accessible={false}
      >
        {/* 배경화면은 화면 전체를 채운다 — 그 위 레이어는 모두 투명이다.
            배경이 있든 없든(그라데이션) 길게 눌러 정하거나 바꿀 수 있어야 한다. */}
        {bgUrl ? (
          <Image source={{ uri: bgUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={gradient()}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}
        <LinearGradient
          colors={scrim()}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <SafeAreaView style={styles.safe} edges={['top']}>
          {topBar}

          {connected ? (
            <View style={styles.body}>
              {/* 남는 세로 공간을 히어로가 먹는다 → 아래 두 줄은 항상 바닥에 붙는다 */}
              <View style={styles.heroSlot}>
                <CoupleHero
                  me={{
                    name: user?.name ?? '나',
                    imageUrl: user?.profileImageUrl,
                    workoutDone: myWorkoutDone,
                    mealDone: myMealDone,
                    streak: myStreak?.currentCount ?? 0,
                    latestLabel: recordLabel(myLatest),
                    latestTime: myLatest ? feedTimeLabel(myLatest.occurredAt) : null,
                    moodEmoji: mood?.mine?.emoji,
                  }}
                  partner={{
                    name: partner?.partnerName ?? couple?.partner?.name ?? '상대방',
                    imageUrl: couple?.partner?.profileImageUrl,
                    workoutDone: !!partner?.completed,
                    mealDone: !!partnerMeal?.completed,
                    streak: partnerStreak?.currentCount ?? 0,
                    latestLabel: recordLabel(partnerLatest),
                    latestTime: partnerLatest ? feedTimeLabel(partnerLatest.occurredAt) : null,
                    moodEmoji: mood?.partner?.emoji,
                  }}
                  dday={dday}
                  anniversaryDate={couple?.anniversaryDate ?? null}
                  onPressDday={openAnnModal}
                  // 예전엔 어느 열을 눌러도 똑같이 전체 '우리 기록'으로 갔다 —
                  // 그 화면은 바로 아래 바로가기에도 있어 버튼 기능이 겹쳤다.
                  // 열을 누르면 그 사람 기록만 거른 화면으로 간다.
                  onPressPerson={(who) => navigation.navigate('FeedTimeline', { who })}
                  /*
                   * 운동/식단 칩 — 예전엔 중앙 FAB 로 "탭 안 옮기고 바로 기록"이 가능했다.
                   * FAB 를 없앤 대신, 이 칩이 그 역할을 대신하도록 목적지를 완료 여부로 가른다:
                   * 오늘 안 했으면 기록 화면으로 바로(FAB 와 동급 속도), 이미 했으면 그 탭의
                   * 메인 화면으로(확인·수정). 어느 열(나/상대)을 눌렀는지는 지금처럼 무시한다 —
                   * 두 화면 모두 로그인한 나의 기록만 보여준다(상대 것을 보는 화면은 앱에 따로
                   * 없다). 그래서 분기 기준도 항상 "나"의 완료 여부(myWorkoutDone/myMealDone)지,
                   * 눌린 열의 done 이 아니다.
                   */
                  onPressToday={(_who, kind) =>
                    kind === 'workout'
                      ? navigation.navigate('Workout', { screen: myWorkoutDone ? 'WorkoutMain' : 'WorkoutRecord' })
                      : navigation.navigate('Diet', { screen: myMealDone ? 'DietMain' : 'DietRecord' })
                  }
                />
              </View>

              {/*
                조건부 한 줄 슬롯 — 홈은 스크롤 없는 고정 화면이라(MemoryPeek 주석 참고) 줄을
                쌓지 않고 하나만 고른다. 우선순위: ① 여행 중(일정표가 지금 필요한 순간) >
                ② 작년 오늘(그날 하루뿐인 희소 콘텐츠) > ③ 여행 D-day(기간 내내 노출되므로
                하루 양보해도 잃는 게 없다). 대부분의 날은 셋 다 없어 비어 있다.
                공용 "최근 기록" 줄은 없앴다 — 좌우 열이 각자의 마지막 기록을 이미 보여준다.
              */}
              {homeTrip && isTripLive(homeTrip) && isTripOngoing(homeTrip) ? (
                <TripPeek
                  trip={homeTrip}
                  onPress={() => navigation.navigate('TripDetail', { tripId: homeTrip.id, title: homeTrip.title })}
                />
              ) : memories ? (
                memories.locked ? (
                  <LockedCard
                    title="작년 오늘"
                    description="함께한 기록을 해마다 다시 꺼내볼 수 있어요"
                    upgradeMessage="작년 오늘의 추억은 PRO에서 볼 수 있어요."
                  />
                ) : (
                  <MemoryPeek memories={memories} onPress={() => navigation.navigate('Memories')} />
                )
              ) : homeTrip && isTripLive(homeTrip) ? (
                <TripPeek
                  trip={homeTrip}
                  onPress={() => navigation.navigate('TripDetail', { tripId: homeTrip.id, title: homeTrip.title })}
                />
              ) : null}

              <QuickActions
                actions={[
                  { icon: 'timeline-text-outline', label: '우리 기록', onPress: () => navigation.navigate('FeedTimeline') },
                  { icon: 'image-plus', label: '일상', onPress: () => navigation.navigate('FeedCompose') },
                  { icon: 'comment-question-outline', label: '질문', onPress: () => navigation.navigate('DailyQuestion') },
                  { icon: 'calendar-heart', label: '캘린더', onPress: () => navigation.navigate('CoupleCalendar') },
                  { icon: 'image-multiple-outline', label: '사진첩', onPress: () => navigation.navigate('PhotoAlbum') },
                  { icon: 'hand-heart-outline', label: '터치', onPress: () => setShowTouchPicker(true) },
                ]}
              />
            </View>
          ) : (
            /*
             * 미연결 상태만 스크롤을 허용한다 — 연결 안내 + 혼자 시작하기 목록이
             * 작은 화면에서 한 눈에 안 들어올 수 있다. 연결되면 고정 화면으로 바뀐다.
             */
            <ScrollView contentContainerStyle={styles.disconnected} showsVerticalScrollIndicator={false}>
              <View style={styles.connectWrap}>
                <MaterialCommunityIcons name="account-multiple-plus-outline" size={40} color={colors.primary} />
                <Text style={styles.connectTitle}>커플을 연결해보세요</Text>
                <Text style={styles.connectDesc}>초대코드로 연결하면 우리의 기록이 시작돼요.</Text>
                <TouchableOpacity style={styles.connectBtn} onPress={() => navigation.navigate('CoupleConnect')}>
                  <Text style={styles.connectBtnText}>커플 연결하기</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.soloTitle}>연결을 기다리는 동안, 혼자서도 시작할 수 있어요</Text>
              <Card elevation="sm" style={styles.soloCard}>
                {/*
                  initial: false — 럽슐랭 탭을 아직 안 연 세션에서 이 카드를 누르면 그 탭이
                  PlaceAdd <b>하나</b>로 시작돼, 저장 후 goBack 할 곳도 가이드로 나갈 길도 없었다.
                  아래에 PlaceMain 을 깔아둔다.
                */}
                {(
                  [
                    { icon: 'dumbbell', label: '운동 기록하기', desc: '오늘 운동을 남기면 스트릭이 시작돼요', go: () => navigation.navigate('Workout', { screen: 'WorkoutRecord' }) },
                    { icon: 'silverware-fork-knife', label: '식단 기록하기', desc: '사진이나 글로 적으면 AI가 칼로리를 계산해요', go: () => navigation.navigate('Diet', { screen: 'DietRecord' }) },
                    { icon: 'map-marker-plus-outline', label: '가고 싶은 장소 저장', desc: '맛집, 여행지, 전시… 둘이 함께 갈 곳을 미리 담아두세요', go: () => navigation.navigate('Place', { screen: 'PlaceAdd', initial: false }) },
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
            </ScrollView>
          )}
        </SafeAreaView>
      </Pressable>

      {/* 기념일 설정 모달 */}
      <Modal visible={annModal} transparent animationType="fade" onRequestClose={() => setAnnModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAnnModal(false)}>
          <Pressable>
            <Card elevation="md" style={styles.modalCard}>
              <Text style={styles.modalTitle}>커플 기념일</Text>
              <Text style={styles.modalDesc}>D+ 카운터의 기준 날짜를 설정해요.</Text>
              <DateField
                value={annInput}
                onChange={setAnnInput}
                placeholder="날짜 선택"
                pickerTitle="커플 기념일"
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

      {/* 가상 터치 — 채팅방을 열지 않고도 보낼 수 있는 진입점 */}
      <TouchGesturePicker
        visible={showTouchPicker}
        onClose={() => setShowTouchPicker(false)}
        onSelect={sendTouch}
      />
      {/* 무드 상태 — topBar 의 진입점에서 연다(위 mood 주석 참고) */}
      <MoodPicker
        visible={showMoodPicker}
        onClose={() => setShowMoodPicker(false)}
        onSelect={sendMood}
      />
    </View>
  );
}

const styles = themedStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  // 배경·스크림·콘텐츠를 함께 담는 무대 — 길게 누르기 Pressable 이 여기다(위 주석 참고).
  // absoluteFill 이 아니라 flex 로 자리를 잡는다: 형제가 아니라 조상이어야 터치가 닿는다.
  stage: { flex: 1 },
  safe: { flex: 1, backgroundColor: 'transparent' },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  // 우측 묶음 — [배경][프로필]
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // 배경 변경 — 사진 위에 놓이므로 아이콘만 두면 밝은 배경에서 묻힌다. 무드 버튼과
  // 같은 표면색 알약으로 깔아 대비를 만든다(크기는 프로필과 같은 최소 터치 타깃).
  bgBtn: {
    minWidth: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  // 아바타는 32px 이라 테두리를 더해도 36px 이다 — hitSlop 이 안 먹는 웹을 위해 크기를 보장한다
  profileBtn: {
    minWidth: layout.touchTarget,
    minHeight: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  // topBar 좌측 — 배경 버튼은 우측(topBarRight)으로 갔고 이 자리는 무드가 쓴다
  moodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    // hitSlop 은 웹에서 무효라 높이를 직접 확보한다 (실측 25px 였다)
    minHeight: layout.touchTarget,
  },
  moodBtnEmoji: { fontSize: 15, lineHeight: 18 },
  moodBtnText: { color: colors.textPrimary, fontSize: fontSize.caption, fontWeight: '700' },

  body: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  // 히어로가 남는 공간을 다 먹는다. 그 안의 분배는 CoupleHero 가 한다
  heroSlot: { flex: 1 },

  disconnected: { padding: spacing.lg },
  connectWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  connectTitle: { color: colors.textPrimary, fontSize: fontSize.title, fontWeight: '800', marginTop: spacing.sm },
  connectDesc: { color: colors.textSecondary, fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.xs },
  connectBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    minHeight: 44, // 터치 타깃 — 텍스트+패딩만으론 36px
    justifyContent: 'center',
  },
  // 버튼 배경이 primary(딥 포레스트)라 글자는 흰색 — white 위 10.61:1
  connectBtnText: { color: colors.white, fontWeight: '800', fontSize: fontSize.body },

  soloTitle: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    // 배경 사진 위에 놓이므로 테마색이 아니라 흰색 고정
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
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

  // spacing.lg 로 통일 — 앱의 다른 모달 8곳과 맞춘다
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { gap: spacing.xs },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  modalDesc: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  modalCancel: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  modalCancelText: { color: colors.textSecondary, fontWeight: '700' },
  modalSave: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary },
  modalSaveText: { color: colors.white, fontWeight: '800' },
}));
