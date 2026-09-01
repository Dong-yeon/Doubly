/** 채팅 대화 — 설계서 2.5 / 4.5 CHAT-02 (실시간 메시지) */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '../../components/Icon';
import { Button } from '../../components/Button';
import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '../../navigation/types';
import { ImageViewer } from '../../components/ImageViewer';
import { Avatar } from '../../components/Avatar';
import { connectSocket } from '../../api/chatSocket';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { useRelationStore } from '../../store/relationStore';
import { useCallStore } from '../../store/callStore';
import { callApi, CallType } from '../../api/call';
import { haptics } from '../../utils/haptics';
import { dismissRoomNotifications } from '../../utils/push';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { EmojiPicker } from '../../components/EmojiPicker';
import { TouchGesturePicker } from '../../components/TouchGesturePicker';
import { SpellCheckBar } from '../../components/SpellCheckBar';
import { MessageActionSheet } from '../../components/MessageActionSheet';
import { SwipeBackView } from '../../components/SwipeBackView';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlanStore } from '../../store/planStore';
import {
  applyAllSuggestions,
  applySuggestion,
  checkKoreanSpelling,
} from '../../utils/koreanSpellCheck';
import { chatApi } from '../../api/chat';
import { isPrShareContent } from '../../utils/workoutShare';
import { isGoalShareContent } from '../../utils/dietShare';
import { touchGestureOf } from '../../constants/touchGestures';
import { callCardLabel, parseCallCard } from '../../utils/callCard';
import { stickerImageOf } from '../../constants/stickerImages';
import { STICKER_PACKS } from '../../constants/stickerPacks';
import { playTouchGesture } from '../../utils/haptics';
import { messagePreview } from '../../utils/messagePreview';
import { chatDateDividerLabel, isSameLocalDay } from '../../utils/date';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { ChatMessage, TouchGestureCode } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { useAndroidKeyboardHeight } from '../../hooks/useAndroidKeyboardHeight';
import { EmptyState } from '../../components/EmptyState';


// zustand 셀렉터가 매번 새 배열을 만들면 무한 리렌더(하얀 화면)가 나므로 안정 참조 사용
const EMPTY_MESSAGES: ChatMessage[] = [];

type Props = NativeStackScreenProps<ChatStackParamList, 'ChatRoom'>;

const timeOf = (iso: string): string => {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

/** 같은 사람이 이 시간 안에 연달아 보내면 한 그룹(카톡처럼 시간 표시를 마지막에만) */
const GROUP_GAP_MS = 5 * 60 * 1000;

export function ChatRoomScreen({ navigation, route }: Props) {
  const { relationId, title } = route.params;
  const headerHeight = useHeaderHeight();
  const androidKeyboardHeight = useAndroidKeyboardHeight();
  /* 탭한 사진 하나만 전체화면으로 — 대화 전체를 훑는 갤러리는 아니라 단건으로 연다 */
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const openImage = (uri: string) => setViewingImage(uri);
  const myId = useAuthStore((s) => s.user?.id);
  /*
   * 말풍선 옆 프로필 사진용 — relationId/title 만 오는 라우트 파라미터엔 이미지가
   * 없어(navigation/types.ts) HomeScreen 이 이미 채워둔 relationStore 를 재사용한다.
   * 채팅 탭으로 바로 진입해 아직 비어 있으면 여기서 한 번 채운다.
   */
  const couple = useRelationStore((s) => s.couple);
  const fetchRelations = useRelationStore((s) => s.fetchAll);
  useEffect(() => {
    if (!couple) fetchRelations().catch(() => {});
  }, [couple, fetchRelations]);
  const partnerName = couple?.partner?.name ?? title;
  const partnerAvatarUrl = couple?.partner?.profileImageUrl;
  const messages = useChatStore((s) => s.messages[relationId] ?? EMPTY_MESSAGES);
  const loadingOlder = useChatStore((s) => s.loadingOlder[relationId] ?? false);
  const { openRoom, closeRoom, send, markRead, replaceMessage, loadOlder, syncMissed } =
    useChatStore();
  const socketConnected = useChatStore((s) => s.connected);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  // 사진 전송 미리보기 — 고른 사진이 바로 전송돼 "고른 게 원하는 사진이 아니었는데
  // 이미 보내졌다"는 리포트가 있었다(2026-08-31). 확인 없이는 업로드하지 않는다.
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  // 입력바 보조 도구는 기본으로 숨겨져 있다가 "+"로 펼친다 — 스티커 패널과는
  // 자리를 공유해서 항상 둘 중 하나만 뜬다(토글 핸들러들이 서로를 닫아준다).
  const [showStickers, setShowStickers] = useState(false);
  /* 시즌 스티커 게이팅 — 표시용 판정이다(최종 판정은 서버). planStore 주석 참고 */
  const premiumStickerAllowed = usePlanStore((s) => s.can('PREMIUM_STICKER'));
  const showUpgrade = usePlanStore((s) => s.showUpgrade);
  const [showExtras, setShowExtras] = useState(false);
  const [showTouchPicker, setShowTouchPicker] = useState(false);
  // 답장 대상 / 수정 중인 메시지 / 리액션 피커 대상
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [reactingTo, setReactingTo] = useState<ChatMessage | null>(null);
  // 길게 누른 메시지 — MessageActionSheet 가 이 값의 존재 여부로 노출된다
  const [actionSheetFor, setActionSheetFor] = useState<ChatMessage | null>(null);
  const [showEmojiSheet, setShowEmojiSheet] = useState(false);
  // 맞춤법 제안을 닫은 시점의 입력값 — 글을 더 치면(값이 달라지면) 다시 뜬다
  const [spellDismissedFor, setSpellDismissedFor] = useState<string | null>(null);
  // 수정 모드에서 응답 대기 중 전송 버튼이 안 막혀 중복 PUT 이 가능했다(QA_CHECKLIST.md P2-19)
  const [editSaving, setEditSaving] = useState(false);
  const spellCheckEnabled = useSettingsStore((s) => s.spellCheckEnabled);
  // 이미 읽음 처리한 최대 메시지 id — 중복 PUT 방지
  const markedUpToRef = useRef(0);
  // 이미 진동을 울린 최대 메시지 id — 화면 재마운트·리렌더로 같은 터치가 다시 울리지 않게
  const hapticedUpToRef = useRef(0);
  /*
   * 전송 버튼은 입력창 밖의 별개 컴포넌트라, 누르면 포커스가 입력창에서 그쪽으로
   * 넘어가면서 키보드가 내려간다(안드로이드 기본 동작) — 연속으로 메시지를 보낼 때마다
   * 매번 입력창을 다시 탭해야 했다(2026-08-31 리포트). 전송 직후 여기로 포커스를
   * 되돌려 키보드가 안 닫히게 한다(카톡·Between 등이 다 이렇게 동작한다).
   */
  const inputRef = useRef<TextInput>(null);

  /*
   * 맞춤법 검사는 기기 안에서만 돈다(외부 전송 없음). 규칙 몇 개짜리라
   * 입력할 때마다 돌려도 부담이 없지만, 렌더마다 다시 하지 않도록 text 에 묶는다.
   */
  const suggestions = useMemo(
    () => (spellCheckEnabled ? checkKoreanSpelling(text) : []),
    [spellCheckEnabled, text],
  );

  /** 첫 제안을 적용한다. 남은 게 있으면 이어서 뜬다 */
  const applySpelling = () => {
    const first = suggestions[0];
    if (!first) return;
    haptics.light();
    setText((prev) => applySuggestion(prev, first));
  };

  /** 제안 전부를 한 번에 적용한다. prev 기준으로 다시 검사해 위치 어긋남을 막는다 */
  const applyAllSpelling = () => {
    if (!suggestions.length) return;
    haptics.light();
    setText((prev) => applyAllSuggestions(prev, checkKoreanSpelling(prev)));
  };

  /*
   * 통화 발신 — 이 화면은 걸기만 담당한다. 벨·통화 중 UI는 전역 CallOverlay(App.tsx)가
   * 어느 화면에서든 뜨므로, 여기서는 세션 생성(callApi.start)과 Stream 콜 오브젝트 생성
   * (client.call().getOrCreate({ring:true}))까지만 하면 나머지는 오버레이가 이어받는다.
   */
  const callClient = useCallStore((s) => s.client);
  const [callStarting, setCallStarting] = useState(false);
  const partnerId = couple?.partner?.id;

  const startCall = useCallback(
    async (callType: CallType) => {
      if (!callClient) {
        toast.error('통화 기능을 준비하지 못했어요. 잠시 후 다시 시도해주세요.');
        return;
      }
      if (!myId || !partnerId || callStarting) return;
      setCallStarting(true);
      let joinedCallId: string | null = null;
      try {
        const joined = await callApi.start(callType);
        joinedCallId = joined.callId;
        const call = callClient.call('default', joined.callId);
        await call.getOrCreate({
          ring: true,
          video: callType === 'VIDEO',
          data: {
            members: [{ user_id: String(myId) }, { user_id: String(partnerId) }],
            /*
             * 음성통화는 카메라를 처음부터 꺼둔다 — CallOverlay 가 곧바로 벨 화면을 띄운다.
             * target_resolution 은 타입상 optional 이지만, video 오버라이드를 하나라도
             * 보내면 Stream 서버가 값 없이는 400(width/height must be 240 or greater)을
             * 뱉는다 — 카메라가 꺼져 있어 실제로 안 쓰이는 값이라 SDK 기본값(640x480)을
             * 그대로 채워 스키마만 만족시킨다. 실기기 테스트로 확인된 이슈(PLAN.md 참고).
             */
            settings_override:
              callType === 'VOICE'
                ? { video: { camera_default_on: false, target_resolution: { width: 640, height: 480 } } }
                : undefined,
          },
        });
      } catch (e) {
        // Stream 쪽 콜 생성이 실패해도 우리 세션은 이미 RINGING 으로 남아있다 —
        // 24시간 안전장치를 기다리지 않고 바로 정리한다(상대에게 헛벨이 안 뜬 상태이므로 무해).
        if (joinedCallId) callApi.end(joinedCallId).catch(() => undefined);
        toast.error(getErrorMessage(e));
      } finally {
        setCallStarting(false);
      }
    },
    [callClient, myId, partnerId, callStarting],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      /*
       * route.params.title 만 쓰면(예전 코드) 채팅 목록에서 들어올 땐 문제없지만,
       * 푸시 알림 탭으로 들어오는 경로(linking.ts 의 'chat/:relationId')는 title
       * 파라미터 자체가 없다 — 그러면 여기서 title: undefined 로 setOptions 를
       * 부르게 돼 네비게이터 옵션의 '채팅' 기본값(ChatStackNavigator)까지 덮어써
       * 버리고, react-navigation 이 최후 수단으로 화면 라우트 이름 "ChatRoom"을
       * 그대로 헤더에 보여줬다(실기기 스크린샷 리포트, 2026-09-01). couple 스토어의
       * 실제 상대 이름(partnerName, 아바타에 이미 쓰는 값)을 우선하면 route
       * 파라미터가 있든 없든 항상 사람이 읽을 수 있는 제목이 나온다.
       */
      title: partnerName ?? '채팅',
      headerRight: () => (
        <View style={styles.headerCallActions}>
          <Pressable
            onPress={() => startCall('VOICE')}
            disabled={callStarting}
            style={({ pressed }) => [styles.headerCallButton, pressed && styles.headerCallButtonPressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="음성통화 걸기"
          >
            <MaterialCommunityIcons name="phone" size={22} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => startCall('VIDEO')}
            disabled={callStarting}
            style={({ pressed }) => [styles.headerCallButton, pressed && styles.headerCallButtonPressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="영상통화 걸기"
          >
            <MaterialCommunityIcons name="video" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, partnerName, startCall, callStarting]);

  /*
   * 히스토리 로딩 상태 — openRoom 이 REST 로 첫 페이지를 받아오는 동안에는 messages 가
   * 빈 배열이라 "메시지 없음"과 "아직 로딩 중"이 구분되지 않았다. TripListScreen 등과
   * 같은 패턴으로 로딩 중엔 EmptyState 를 숨긴다(QA_CHECKLIST.md 패턴10).
   */
  const [loadingHistory, setLoadingHistory] = useState(true);
  useEffect(() => {
    setLoadingHistory(true);
    openRoom(relationId).finally(() => setLoadingHistory(false));
    // 이 방으로 이미 와 있던 알림(트레이에 뜬 것)을 지운다 — 앞으로 올 알림 억제는
    // chatStore.activeRoomId + push.ts 핸들러가 맡는다.
    void dismissRoomNotifications(relationId);
    return () => closeRoom(relationId);
  }, [relationId, openRoom, closeRoom]);

  /*
   * 포그라운드 복귀 시 따라잡기.
   *
   * 백그라운드에 있는 동안 OS 가 소켓을 끊는 건 정상이고, 돌아오면 stompjs 가 다시 붙이고
   * chatSocket 이 구독까지 되살린다. 하지만 <b>끊겨 있던 사이에 온 메시지</b>는 소켓으로
   * 오지 않는다 — 소켓은 붙은 뒤의 것만 준다. 그 공백은 REST 로 메워야 한다.
   * (이게 없으면 "알림은 왔는데 방을 열어보니 그 메시지가 없다"가 된다.)
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void connectSocket().catch(() => undefined);
      void syncMissed(relationId).catch(() => undefined);
    });
    return () => sub.remove();
  }, [relationId, syncMissed]);

  // 새 메시지 도착 시 상대방 최신 메시지까지 읽음 처리 (id 게이트로 중복 호출 방지)
  useEffect(() => {
    const latestIncoming = messages.find((m) => m.senderId !== myId); // 최신순이라 첫 항목
    if (!latestIncoming || latestIncoming.id <= markedUpToRef.current) return;

    /*
     * 예전엔 실패 시 markedUpToRef 만 0 으로 되돌리고 끝이라, messages 가 다시
     * 바뀌어야만(=새 메시지 도착) 재시도됐다. 조용히 실패하면 새 메시지가 없는 한
     * 영영 재시도가 안 됐다(QA_CHECKLIST.md P2-20). 새 메시지 없이도 언젠가는
     * 재시도되도록 짧은 지연 후 스스로 다시 시도한다 — 언마운트/재실행 시 정리한다.
     */
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const attempt = (targetId: number) => {
      markedUpToRef.current = targetId;
      markRead(targetId).catch(() => {
        markedUpToRef.current = 0;
        timeoutId = setTimeout(() => attempt(targetId), 5000);
      });
    };
    attempt(latestIncoming.id);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [messages, myId, markRead]);

  /*
   * 상대가 보낸 가상 터치를 받으면 즉시 진동한다 — 채팅방이 열려 있을 때(포그라운드)만
   * 되는 경로다. 백그라운드/종료 상태는 일반 푸시 알림으로 대체된다(PLAN.md "가상 터치" 참고).
   * messages 는 최신순(inverted)이라 첫 항목이 최신 메시지다.
   */
  useEffect(() => {
    const latest = messages[0];
    if (!latest || latest.id <= hapticedUpToRef.current) return;
    hapticedUpToRef.current = latest.id;
    if (latest.messageType === 'TOUCH' && latest.senderId !== myId) {
      playTouchGesture(latest.content);
    }
  }, [messages, myId]);

  const onSend = async () => {
    const content = text.trim();
    if (!content) return;

    // 수정 모드 — 전송 대신 기존 메시지를 고친다
    if (editing) {
      if (editSaving) return; // 응답 대기 중 중복 탭 방지
      setEditSaving(true);
      try {
        const updated = await chatApi.edit(editing.id, content);
        replaceMessage(relationId, updated);
        setEditing(null);
        setText('');
        haptics.light();
        inputRef.current?.focus();
      } catch (e) {
        toast.error(getErrorMessage(e, '메시지를 수정하지 못했어요.'));
      } finally {
        setEditSaving(false);
      }
      return;
    }

    const ok = await send(relationId, {
      messageType: 'TEXT',
      content,
      replyToId: replyTo?.id,
    });
    if (ok) {
      setText('');
      setReplyTo(null);
      haptics.light();
      inputRef.current?.focus();
    } else {
      Alert.alert('전송 실패', '연결이 끊겼어요. 잠시 후 다시 시도해주세요.');
    }
  };

  /** 메시지 길게 누르기 — MessageActionSheet 로 리액션/답장/수정/삭제를 한 시트에 모은다 */
  const onLongPressMessage = (msg: ChatMessage) => {
    if (msg.deleted) return;
    haptics.light();
    setActionSheetFor(msg);
  };

  const closeActionSheet = () => setActionSheetFor(null);

  const onQuickReactFromSheet = (emoji: string) => {
    const msg = actionSheetFor;
    closeActionSheet();
    if (msg) onReact(msg, emoji);
  };

  const onMoreEmojiFromSheet = () => {
    const msg = actionSheetFor;
    closeActionSheet();
    if (msg) setReactingTo(msg);
  };

  const onReplyFromSheet = () => {
    const msg = actionSheetFor;
    closeActionSheet();
    if (msg) { setEditing(null); setReplyTo(msg); }
  };

  const onEditFromSheet = () => {
    const msg = actionSheetFor;
    closeActionSheet();
    if (msg) { setReplyTo(null); setEditing(msg); setText(msg.content ?? ''); }
  };

  const onDeleteFromSheet = () => {
    const msg = actionSheetFor;
    closeActionSheet();
    if (msg) onDelete(msg);
  };

  const onDelete = (msg: ChatMessage) => {
    Alert.alert('메시지 삭제', '이 메시지를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            replaceMessage(relationId, await chatApi.remove(msg.id));
          } catch (e) {
            toast.error(getErrorMessage(e, '메시지를 삭제하지 못했어요.'));
          }
        },
      },
    ]);
  };

  const onReact = async (msg: ChatMessage, emoji: string) => {
    try {
      const reactions = await chatApi.react(msg.id, emoji);
      replaceMessage(relationId, { ...msg, reactions });
      haptics.light();
    } catch (e) {
      toast.error(getErrorMessage(e, '리액션을 남기지 못했어요.'));
    }
  };

  /**
   * 시즌 스티커는 PRO 전용 — 보내기 전에 막고 이유를 알려준다.
   *
   * STOMP 경로는 REST 처럼 402 를 화면으로 되돌려줄 방법이 없다(서버 검증은 우회 방지용
   * 방어선일 뿐 사용자에게는 조용히 실패로 보인다). TouchGesturePicker 와 같은 규칙.
   */
  const sendSticker = async (sticker: string, locked: boolean, label: string) => {
    if (locked) {
      showUpgrade(`${label} 스티커는 PRO에서 보낼 수 있어요.`);
      return;
    }
    const ok = await send(relationId, { messageType: 'STICKER', content: sticker });
    if (ok) {
      setShowStickers(false);
      haptics.light();
    } else {
      Alert.alert('전송 실패', '연결이 끊겼어요. 잠시 후 다시 시도해주세요.');
    }
  };

  const sendTouch = async (code: TouchGestureCode) => {
    const ok = await send(relationId, { messageType: 'TOUCH', content: code });
    if (ok) haptics.light();
    else Alert.alert('전송 실패', '연결이 끊겼어요. 잠시 후 다시 시도해주세요.');
  };

  // 갤러리에서 고르기만 한다 — 실제 업로드·전송은 미리보기에서 "보내기"를 눌러야 시작된다
  const onPickImage = async () => {
    try {
      const uri = await pickImage();
      if (!uri) return;
      setPendingImage(uri);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 불러오지 못했어요.'));
    }
  };

  const onCancelSendImage = () => setPendingImage(null);

  const onConfirmSendImage = async () => {
    const uri = pendingImage;
    if (!uri) return;
    setPendingImage(null);
    setUploading(true);
    try {
      const url = await runBusy('사진 보내는 중…', () => uploadImage(uri));
      const ok = await send(relationId, { messageType: 'IMAGE', imageUrl: url });
      if (ok) haptics.light();
      else Alert.alert('전송 실패', '연결이 끊겼어요. 잠시 후 다시 시도해주세요.');
    } catch (e) {
      toast.error(getErrorMessage(e, '이미지 전송에 실패했어요.'));
    } finally {
      setUploading(false);
    }
  };

  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const mine = item.senderId === myId;
    const isImage = item.messageType === 'IMAGE' && !!item.imageUrl;
    const isSticker = item.messageType === 'STICKER';
    const isTouch = item.messageType === 'TOUCH';
    const isWorkout = item.messageType === 'WORKOUT_CARD';
    const isMeal = item.messageType === 'MEAL_CARD';
    // 루틴 공유(트레이너-회원) — 운동 카드와 같은 레이아웃에 배지만 다르게
    const isRoutine = item.messageType === 'ROUTINE_CARD';
    const callCard = item.messageType === 'CALL_CARD' ? parseCallCard(item.content) : null;
    // PR(자기 최고 기록) 공유 카드 — 문구 접두어로 구분한다(workoutShare.ts, 단일 출처)
    const isPr = isWorkout && isPrShareContent(item.content);
    // 영양 목표 달성 공유 카드 — 문구 접두어로 구분한다(dietShare.ts, 단일 출처)
    const isGoal = isMeal && isGoalShareContent(item.content);

    /*
     * 메시지 그룹핑 — 카카오톡처럼 같은 사람이 짧은 간격으로 연달아 보내면
     * 한 덩어리로 묶는다. messages 는 최신순(inverted FlatList)이라 배열의
     * 다음 인덱스(+1)가 더 과거, 이전 인덱스(-1)가 더 최근이다.
     */
    const older = messages[index + 1];
    const newer = messages[index - 1];
    const closeTo = (other: ChatMessage | undefined) =>
      !!other && !item.deleted && !other.deleted && other.senderId === item.senderId
      && isSameLocalDay(item.createdAt, other.createdAt)
      && Math.abs(new Date(item.createdAt).getTime() - new Date(other.createdAt).getTime()) <= GROUP_GAP_MS;
    // 그룹의 첫 메시지(= 위와 간격을 띄운다) / 마지막 메시지(= 시간·읽음을 보여준다)
    const isGroupStart = !closeTo(older);
    const isGroupEnd = !closeTo(newer);
    // 날짜가 바뀌는 경계 — 더 과거 메시지가 없거나 날짜가 다르면 그 앞에 구분선
    const showDateDivider = !older || !isSameLocalDay(item.createdAt, older.createdAt);
    const divider = showDateDivider ? (
      <View style={styles.dateDivider}>
        <View style={styles.dateDividerLine} />
        <Text style={styles.dateDividerText}>{chatDateDividerLabel(item.createdAt)}</Text>
        <View style={styles.dateDividerLine} />
      </View>
    ) : null;

    // 삭제된 메시지는 자리만 남기고 내용을 감춘다 (답장·리액션 참조가 살아있다)
    if (item.deleted) {
      return (
        <View>
          {divider}
          <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, isGroupStart ? styles.rowSpaced : styles.rowGrouped]}>
            {/* 삭제된 메시지는 그룹핑 대상이 아니라(항상 혼자) 아바타를 조건 없이 보여준다 */}
            {!mine ? (
              <View style={styles.avatarSlot}>
                <Avatar name={partnerName} imageUrl={partnerAvatarUrl} size={26} color={colors.partner} />
              </View>
            ) : null}
            <View style={[styles.bubble, styles.bubbleDeleted]}>
              <Text style={styles.deletedText}>삭제된 메시지예요</Text>
            </View>
            <Text style={styles.time}>{timeOf(item.createdAt)}</Text>
          </View>
        </View>
      );
    }

    /*
     * 스트릭 마일스톤 축하 — 서버가 <b>양쪽을 대신해</b> 남긴 알림이라 발신자 정렬
     * 말풍선이 어색하다(누가 보낸 게 아니다). 날짜 구분선처럼 가운데 배너로 그린다.
     * content 는 그대로 읽히는 문장이라 파싱이 필요 없다.
     */
    if (item.messageType === 'STREAK_CARD') {
      return (
        <View>
          {divider}
          <View style={styles.streakBanner}>
            <MaterialCommunityIcons name="fire" size={16} color={colors.coral} />
            <Text style={styles.streakBannerText}>{item.content}</Text>
          </View>
        </View>
      );
    }

    return (
      <View>
      {divider}
      <View style={[
        styles.msgBlock,
        mine ? styles.blockMine : styles.blockTheirs,
        isGroupStart ? styles.msgBlockSpaced : styles.msgBlockGrouped,
      ]}>
        {/* 인용한 원본 — 말풍선 위에 한 줄 */}
        {item.replyTo ? (
          <View style={[styles.quote, mine ? styles.quoteMine : styles.quoteTheirs]}>
            <Text style={styles.quoteWho}>
              {item.replyTo.senderId === myId ? '나' : title}에게 답장
            </Text>
            {/* content 를 그대로 쓰면 TOUCH/이미지 스티커는 'HAND_HOLD', 'LOVE_BEAR' 같은
                코드가 그대로 노출된다 — 아래 배너와 같은 이유로 messagePreview 를 거친다 */}
            <Text style={styles.quoteText} numberOfLines={1}>
              {item.replyTo.content != null
                ? messagePreview(item.replyTo.messageType, item.replyTo.content)
                : '삭제된 메시지'}
            </Text>
          </View>
        ) : null}

        <Pressable
          onLongPress={() => onLongPressMessage(item)}
          delayLongPress={300}
          style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}
        >
        {/*
          상대 프로필 — 그룹의 마지막(가장 최근) 말풍선 옆에만, 시간·읽음과 같은 자리에.
          그룹 중간 메시지는 폭이 같은 빈 슬롯을 둬서 말풍선이 계단식으로 밀리지 않게 한다.
          내 메시지는 정렬·색으로 이미 구분되므로 아바타를 붙이지 않는다(불필요한 중복).
        */}
        {!mine ? (
          <View style={styles.avatarSlot}>
            {isGroupEnd ? (
              <Avatar name={partnerName} imageUrl={partnerAvatarUrl} size={26} color={colors.partner} />
            ) : null}
          </View>
        ) : null}
        {isSticker ? (
          stickerImageOf(item.content) ? (
            <Image source={stickerImageOf(item.content)!.source} style={styles.stickerImage} resizeMode="contain" />
          ) : (
            <Text style={styles.sticker}>{item.content}</Text>
          )
        ) : isTouch ? (
          // 스티커처럼 말풍선 없이 크게 — 이모지 아래 제스처 라벨을 붙인다
          <View style={styles.touchBlock}>
            <Text style={styles.sticker}>{touchGestureOf(item.content)?.emoji ?? '🤍'}</Text>
            <Text style={styles.touchLabel}>{touchGestureOf(item.content)?.label ?? '터치'}</Text>
          </View>
        ) : isImage ? (
          /* 탭하면 전체화면 — 예전엔 200×200 으로 잘린 썸네일이 전부라 원본을 볼 수 없었다 */
          <Pressable
            onPress={() => openImage(item.imageUrl!)}
            accessibilityRole="imagebutton"
            accessibilityLabel="사진 크게 보기"
          >
            <Image source={{ uri: item.imageUrl! }} style={styles.msgImage} resizeMode="cover" />
          </Pressable>
        ) : isWorkout || isRoutine ? (
          <View style={[
            styles.workoutCard,
            mine ? styles.workoutCardMine : styles.workoutCardTheirs,
            isPr && styles.workoutCardPr,
          ]}>
            <Text style={[styles.workoutBadge, isPr && styles.workoutBadgePr]}>
              {isPr ? 'PR 달성 🔥' : isRoutine ? '루틴' : '운동 기록'}
            </Text>
            <Text style={[styles.workoutText, mine && styles.workoutTextMine]}>{item.content}</Text>
          </View>
        ) : isMeal ? (
          <View style={[
            styles.mealCard,
            mine ? styles.mealCardMine : styles.mealCardTheirs,
            isGoal && styles.mealCardGoal,
          ]}>
            <Text style={[styles.mealBadge, isGoal && styles.mealBadgeGoal]}>
              {isGoal ? '목표 달성 🎯' : '식단'}
            </Text>
            {item.imageUrl ? (
              <Pressable
                onPress={() => openImage(item.imageUrl!)}
                accessibilityRole="imagebutton"
                accessibilityLabel="식단 사진 크게 보기"
              >
                <Image source={{ uri: item.imageUrl }} style={styles.mealImage} resizeMode="cover" />
              </Pressable>
            ) : null}
            {item.content ? (
              <Text style={styles.workoutText}>{item.content}</Text>
            ) : null}
          </View>
        ) : callCard ? (
          <View style={[styles.callCard, mine ? styles.callCardMine : styles.callCardTheirs]}>
            <MaterialCommunityIcons
              name={callCard.callType === 'VIDEO' ? 'video' : 'phone'}
              size={18}
              color={callCard.outcome === 'ENDED' ? colors.textPrimary : colors.coral}
            />
            <Text style={styles.callCardText}>{callCardLabel(callCard)}</Text>
            {/* 정상 종료 통화도 "다시 걸기"를 굳이 막지 않는다 — 통화 기록에서 재발신하는 흔한 동작 */}
            <Pressable
              onPress={() => startCall(callCard.callType)}
              disabled={callStarting}
              style={({ pressed }) => [styles.callCardButton, pressed && styles.headerCallButtonPressed]}
              accessibilityRole="button"
              accessibilityLabel="다시 걸기"
            >
              <Text style={styles.callCardButtonText}>다시 걸기</Text>
            </Pressable>
          </View>
        ) : (
          // 꼬리(뾰족한 모서리)는 그룹의 마지막 말풍선에만 — 나머지는 완전히 둥글게 이어붙는다
          <View style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
            !isGroupEnd && (mine ? styles.bubbleMineGrouped : styles.bubbleTheirsGrouped),
          ]}>
            <Text style={[styles.msgText, mine && styles.msgTextMine]}>{item.content}</Text>
          </View>
        )}
        {/*
          시간은 그룹의 마지막(가장 최근) 메시지에만 — 카톡처럼 한 번만 보여준다
          (2026-09-01, 메시지마다 표시하던 걸 다시 되돌림). 읽음(하트)·수정 표시는
          메시지마다 그대로 유지한다 — isRead 는 메시지마다 따로 갖는 값이라 시간과
          달리 "몇 번째까지 읽었는지"가 중요한 정보라서 그룹 끝으로 뭉치면 안 된다.
        */}
        {(isGroupEnd || (mine && !item.isRead) || item.edited) ? (
          <View style={mine ? styles.metaMine : styles.meta}>
            {/*
              읽음은 내가 보낸 메시지에만 — 상대 메시지의 읽음 여부는 알 필요가 없다.
              점(dot)이 채워지는 방식은 "색이 바뀐 걸 알아채야만 안다"는 점에서
              눈에 잘 안 띈다는 피드백으로, 카톡 "1"처럼 있다가 사라지는 방식으로
              바꿨다(2026-08-31) — 안 읽었을 때만 하트를 보여주고, 읽으면 그냥
              없앤다. 색은 "상대"의 고유색(colors.partner)을 그대로 써서 이 앱의
              나/상대 색 체계(theme/colors.ts 의 Duo 시맨틱)를 유지한다.
            */}
            {mine && !item.isRead ? (
              <MaterialCommunityIcons
                name="heart"
                size={10}
                color={colors.partner}
                style={styles.readHeart}
                accessibilityLabel="아직 안 읽었어요"
              />
            ) : null}
            {item.edited ? <Text style={styles.editedMark}>수정됨</Text> : null}
            {isGroupEnd ? <Text style={styles.time}>{timeOf(item.createdAt)}</Text> : null}
          </View>
        ) : null}
        </Pressable>

        {/* 리액션 칩 — 다시 누르면 해제된다. mine 은 userIds 로 판단(브로드캐스트 공용) */}
        {item.reactions && item.reactions.length > 0 ? (
          <View style={[styles.reactionRow, mine ? styles.reactionRowMine : null]}>
            {item.reactions.map((r) => {
              const isMine = !!myId && r.userIds.includes(myId);
              return (
                <Pressable
                  key={r.emoji}
                  style={[styles.reactionChip, isMine && styles.reactionChipMine]}
                  onPress={() => onReact(item, r.emoji)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.emoji} 리액션`}
                  accessibilityState={{ selected: isMine }}
                >
                  <Text style={styles.reactionChipEmoji}>{r.emoji}</Text>
                  {r.count > 1 ? <Text style={styles.reactionChipCount}>{r.count}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      </View>
    );
  };

  return (
    <SwipeBackView style={styles.flex}>
    {/*
     * left/right 도 인셋에 포함한다(가로 화면·노치가 옆에 오는 기기 대비) — 온보딩의
     * 여백 없는 화면들(RegisterScreen 등)과 같은 패턴. 아래 inputBar 의 가로·세로
     * 여백은 별개로 늘렸다 — 화면 모서리가 물리적으로 둥글어서, safe-area 인셋만
     * 으론 안 잡히는 "동그란 버튼이 모서리 곡률에 살짝 잘려 보이는" 문제라 안전
     * 영역과는 무관하다(inputBar 스타일 주석 참고).
     */}
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        // Android 는 FlatList 를 직접 감싸면 KeyboardAvoidingView 의 자동 높이 보정이
        // edge-to-edge 아래에서 먹지 않아(실기기 확인) behavior 를 아예 안 쓰고
        // useAndroidKeyboardHeight 로 받은 실측 키보드 높이만큼 직접 패딩을 준다.
        style={[styles.flex, Platform.OS === 'android' && { paddingBottom: androidKeyboardHeight }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        /*
         * 오프셋은 실제 헤더 높이로 — 예전엔 90 을 상수로 박아서 노치 없는 기기
         * (헤더 ≈64)에서 26pt 과보정돼 입력창과 키보드 사이에 빈 띠가 생겼다.
         */
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        {/*
          * 연결이 끊긴 동안에는 그렇다고 말한다. 예전엔 store 의 connected 가 방에 처음
          * 들어올 때 true 로 고정돼서, 소켓이 죽어도 화면은 멀쩡해 보였다 — 사용자는
          * "왜 답이 없지"라고 생각하고, 보낸 뒤에야 실패를 알았다.
          */}
        {socketConnected ? null : (
          <View style={styles.offlineBar} accessibilityRole="alert">
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text style={styles.offlineText}>연결 중이에요… 잠시만요</Text>
          </View>
        )}
        <FlatList
          style={styles.flex}
          data={messages}
          inverted
          keyExtractor={(m) => String(m.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          /*
           * 과거 메시지 페이징 — inverted 목록이라 onEndReached = 위(가장 오래된 쪽) 도달.
           * 서버 커서는 준비돼 있었지만 연결이 안 돼 첫 페이지 이전 대화를 볼 수 없었다.
           */
          onEndReached={() => loadOlder(relationId)}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingOlder ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.olderSpinner} />
            ) : null
          }
          /*
           * 새로 만든 채팅방처럼 대화 이력이 아예 없을 때 안내 — 로딩 중(loadingHistory)
           * 엔 잠깐 빈 배열로 보이는 순간이 있어 그 사이엔 띄우지 않는다(QA_CHECKLIST.md
           * 패턴10). inverted 리스트라 컨텐츠 전체가 scaleY:-1 로 뒤집혀 렌더되므로
           * EmptyState 를 그대로 두면 거꾸로 보인다 — 감싸는 뷰에서 다시 뒤집어 바로 세운다.
           */
          ListEmptyComponent={
            !loadingHistory ? (
              <View style={styles.emptyMessagesWrap}>
                <EmptyState icon="chat-outline" title="아직 메시지가 없어요" description="첫 메시지를 보내보세요!" />
              </View>
            ) : null
          }
          // 스크롤 드래그로 키보드를 내릴 수 있게 (iOS 는 손가락을 따라 내려간다)
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        />
        {/*
         * 보조 도구 트레이 — 예전엔 스티커·터치·무드·카메라 4개 버튼이 입력바에 항상 떠
         * 있어(46px×4) 좁은 기기에서 입력창이 짓눌렸다. "+" 로 펼치는 트레이 하나로
         * 모으고, 스티커 패널과 자리를 공유한다(둘 중 하나만 뜬다).
         *
         * 무드는 여기 없다 — "대화창에 보내는" 액션(스티커·터치·사진)이 아니라 대화
         * 로그에 안 남는 "내 상태" 이기 때문에 카테고리가 안 맞았다. 지금은 HomeScreen
         * 상단바에서 설정한다(그 파일 topBar 주석 참고).
         */}
        {showExtras ? (
          <View style={styles.extrasPanel}>
            <ExtraButton
              icon="sticker-emoji"
              label="스티커"
              onPress={() => { setShowExtras(false); setShowStickers(true); }}
            />
            <ExtraButton
              icon="hand-heart-outline"
              label="터치"
              onPress={() => { setShowExtras(false); setShowTouchPicker(true); }}
            />
            <ExtraButton
              icon="camera-outline"
              label="사진"
              onPress={() => { setShowExtras(false); onPickImage(); }}
            />
          </View>
        ) : null}
        {showStickers ? (
          // 팩이 6개(64종)라 한 화면에 안 들어간다 — 패널 안에서만 스크롤한다
          <ScrollView style={styles.stickerScroll} contentContainerStyle={styles.stickerPanel}>
            <Pressable
              style={({ pressed }) => [styles.stickerBtn, pressed && styles.iconPressed]}
              onPress={() => { setShowStickers(false); setShowEmojiSheet(true); }}
              accessibilityRole="button"
              accessibilityLabel="이모지 더 보기"
              // 격자라 크기를 키우면 열 수가 바뀐다 — 터치 영역만 넓힌다
              hitSlop={4}
            >
              <MaterialCommunityIcons name="dots-horizontal" size={24} color={colors.textSecondary} />
            </Pressable>
            {STICKER_PACKS.flatMap((pack) => {
              const locked = pack.premium && !premiumStickerAllowed;
              return [
                // 팩 구분선 겸 이름표 — 기본 세트는 이름 없이 바로 시작한다(예전 그대로)
                pack.premium ? (
                  <View key={`${pack.key}-label`} style={styles.stickerPackLabel}>
                    <Text style={styles.stickerPackLabelText}>{pack.label}</Text>
                    {locked ? <Text style={styles.stickerPackBadge}>PRO</Text> : null}
                  </View>
                ) : null,
                ...pack.stickers.map((s) => {
                  const img = stickerImageOf(s);
                  return (
                    <Pressable
                      key={s}
                      style={({ pressed }) => [
                        styles.stickerBtn,
                        locked && styles.stickerLocked,
                        pressed && styles.iconPressed,
                      ]}
                      onPress={() => sendSticker(s, locked, pack.label)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        `스티커 ${img?.label ?? s} 보내기${locked ? ' — PRO 기능' : ''}`
                      }
                    >
                      {img ? (
                        <Image source={img.source} style={styles.stickerBtnImage} resizeMode="contain" />
                      ) : (
                        <Text style={styles.stickerEmoji}>{s}</Text>
                      )}
                    </Pressable>
                  );
                }),
              ];
            })}
          </ScrollView>
        ) : null}
        {/* 답장·수정 중 배너 — 무엇에 대해 쓰고 있는지 보여주고 취소할 수 있게 */}
        {replyTo || editing ? (
          <View style={styles.composeBanner}>
            <View style={styles.composeBannerBody}>
              <Text style={styles.composeBannerLabel}>
                {editing ? '메시지 수정 중' : '답장'}
              </Text>
              {/* content 를 그대로 쓰면 TOUCH 는 'HAND_HOLD' 같은 제스처 코드가 노출된다 */}
              <Text style={styles.composeBannerText} numberOfLines={1}>
                {messagePreview((editing ?? replyTo)!.messageType, (editing ?? replyTo)!.content)}
              </Text>
            </View>
            <Pressable
              onPress={() => { setReplyTo(null); setEditing(null); setText(''); }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="취소"
            >
              <MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}
        <SpellCheckBar
          suggestion={spellDismissedFor === text ? null : (suggestions[0] ?? null)}
          total={suggestions.length}
          onApply={applySpelling}
          onApplyAll={applyAllSpelling}
          onDismiss={() => setSpellDismissedFor(text)}
        />
        <View style={styles.inputBar}>
          {uploading ? (
            <View style={styles.imageBtn}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.imageBtn, showExtras && styles.stickerToggleActive]}
              onPress={() => { setShowStickers(false); setShowExtras((v) => !v); }}
              accessibilityRole="button"
              accessibilityLabel={showExtras ? '보조 도구 닫기' : '스티커·터치·사진 더 보기'}
            >
              <MaterialCommunityIcons
                name={showExtras ? 'close' : 'plus'}
                size={24}
                color={showExtras ? colors.primary : colors.textSecondary}
                style={styles.trayIcon}
              />
            </TouchableOpacity>
          )}
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="메시지를 입력하세요"
            placeholderTextColor={colors.textSecondary}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || editSaving) && styles.sendDisabled]}
            onPress={onSend}
            disabled={!text.trim() || editSaving}
            accessibilityRole="button"
            accessibilityLabel={editing ? '수정 완료' : '전송'}
          >
            <MaterialCommunityIcons name="send" size={20} color={colors.white} style={styles.sendIcon} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 사진 전체화면 보기 */}
      <ImageViewer
        images={viewingImage ? [{ key: viewingImage, uri: viewingImage }] : []}
        initialIndex={viewingImage ? 0 : null}
        onClose={() => setViewingImage(null)}
      />

      {/* 사진 전송 미리보기 — 고른 즉시 보내지 않고 확인 후에만 업로드·전송한다 */}
      <Modal visible={!!pendingImage} transparent animationType="fade" onRequestClose={onCancelSendImage}>
        <View style={styles.imagePreviewBackdrop}>
          {pendingImage ? (
            <Image source={{ uri: pendingImage }} style={styles.imagePreviewImage} resizeMode="contain" />
          ) : null}
          <View style={styles.imagePreviewActions}>
            <Button
              title="취소"
              variant="secondary"
              onPress={onCancelSendImage}
              style={styles.imagePreviewBtn}
            />
            <Button title="보내기" onPress={onConfirmSendImage} style={styles.imagePreviewBtn} />
          </View>
        </View>
      </Modal>

      {/* 리액션 선택 — 길게 누른 메시지에 이모지를 붙인다 */}
      <EmojiPicker
        visible={reactingTo !== null}
        title="리액션 선택"
        onClose={() => setReactingTo(null)}
        onSelect={(emoji) => {
          if (reactingTo) onReact(reactingTo, emoji);
          setReactingTo(null);
        }}
      />
      {/* 스티커 전송 — 말풍선 없이 크게 그려진다 */}
      <EmojiPicker
        visible={showEmojiSheet}
        title="스티커 보내기"
        onClose={() => setShowEmojiSheet(false)}
        // 이모지 시트에서 직접 고른 이모지는 어느 팩에도 없으므로 무료다(stickerPacks 주석)
        onSelect={(emoji) => sendSticker(emoji, false, '이모지')}
      />
      {/* 가상 터치 — 상대 폰에 즉시 진동. 프리미엄 제스처는 시트 안에서 자체적으로 게이팅한다 */}
      <TouchGesturePicker
        visible={showTouchPicker}
        onClose={() => setShowTouchPicker(false)}
        onSelect={sendTouch}
      />
      {/* 메시지 길게 누르기 — 리액션/답장/수정/삭제를 한 시트에 모아 보여준다 */}
      <MessageActionSheet
        message={actionSheetFor}
        mine={!!actionSheetFor && actionSheetFor.senderId === myId}
        canEdit={!!actionSheetFor && actionSheetFor.senderId === myId && actionSheetFor.messageType === 'TEXT'}
        onClose={closeActionSheet}
        onQuickReact={onQuickReactFromSheet}
        onMoreEmoji={onMoreEmojiFromSheet}
        onReply={onReplyFromSheet}
        onEdit={onEditFromSheet}
        onDelete={onDeleteFromSheet}
      />
    </SafeAreaView>
    </SwipeBackView>
  );
}

/** 보조 도구 트레이 버튼 — 아이콘 + 라벨 한 줄 (트레이 안이라 별도 발견성 힌트가 필요) */
function ExtraButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.extraBtn, pressed && styles.iconPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={22} color={colors.textSecondary} />
      <Text style={styles.extraLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  headerCallActions: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.xs },
  headerCallButton: { minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  headerCallButtonPressed: { opacity: 0.6 },
  list: { padding: spacing.md },
  imagePreviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  imagePreviewImage: { width: '100%', height: '70%', borderRadius: radius.lg },
  imagePreviewActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, width: '100%' },
  imagePreviewBtn: { flex: 1 },
  // inverted FlatList 의 콘텐츠는 scaleY:-1 로 뒤집혀 그려진다 — EmptyState 만 다시
  // 뒤집어 정방향으로 보이게 한다(QA_CHECKLIST.md 패턴10)
  emptyMessagesWrap: { transform: [{ scaleY: -1 }] },
  // 그룹 간 세로 간격은 msgBlock(정상 메시지)·row(삭제된 메시지)가 각각 spaced/grouped 로 담당한다
  //
  // flexShrink: 1 이 row·bubble 둘 다에 필요하다 — RN 은 웹 flexbox와 달리 flex 자식의
  // 기본 flexShrink 가 0이라, 이게 없으면 공백 없이 이어지는 긴 텍스트(ㅋㅋㅋㅋ… 등)에서
  // maxWidth(82%, msgBlock 이 담당)를 무시하고 말풍선이 화면 밖까지 그대로 늘어난다
  // (줄바꿈이 안 됨, 28c9809).
  //
  // row 자신에는 maxWidth 를 안 준다(예전엔 '80%' 를 여기도 줬었다) — msgBlock 은
  // width 가 없고 maxWidth(82%) 만으로 내용 크기에 맞춰(shrink-to-fit) 그려지는데,
  // 그 폭이 아직 정해지지 않은 상태에서 자식(row)에 또 퍼센트(msgBlock 의 80%)를
  // 매기면 Yoga 가 첫 측정 패스에서 사실상 0에 가까운 값으로 잘못 계산해버린다 —
  // "그렇네유~" 같은 짧은 한 줄짜리 메시지가 화면 폭이 넉넉히 남는데도 3줄로
  // 쪼개져 나오던 원인이 이 이중 퍼센트였다(2026-08-31 리포트). msgBlock 의
  // maxWidth 하나만으로 이미 충분히 제약되므로 row 는 flexShrink 만 갖고, 정말
  // 넘칠 때만 msgBlock 의 실제(px) 박스 안에서 줄어들게 한다.
  row: { flexShrink: 1, flexDirection: 'row', alignItems: 'flex-end' },
  rowMine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  rowTheirs: { alignSelf: 'flex-start' },
  rowSpaced: { marginTop: spacing.sm },
  rowGrouped: { marginTop: spacing.xxs },
  bubble: { flexShrink: 1, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  // 예전엔 surface(흰색)+테두리로 배경과 구분했는데, background(#FAFAF9)와 거의
  // 같은 색이라 테두리 선이 메시지마다 하나씩 더 생겨 화면이 촘촘해 보였다
  // (Between 비교 피드백, 2026-08-31). surfaceAlt 는 그 자체로 배경과 대비가
  // 나와(WCAG 계산 주석 참고) 테두리 없이도 말풍선이 구분된다.
  bubbleTheirs: { backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 6 },
  // 그룹 중간 말풍선(마지막이 아님) — 꼬리 없이 완전히 둥글게 이어붙는다
  bubbleMineGrouped: { borderBottomRightRadius: radius.lg },
  bubbleTheirsGrouped: { borderBottomLeftRadius: radius.lg },
  // subtitle(16)이던 걸 한 단계 내렸다 — 그룹핑·아바타로 밀도가 오른 목록에서
  // 상대적으로 더 커 보였다(비교 화면 피드백). lineHeight 는 body(14)의 기존
  // 1.5배 관행(typography.ts cardBody)과 같은 21을 그대로 쓴다.
  msgText: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 21 },
  msgTextMine: { color: colors.white },
  msgImage: { width: 200, height: 200, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  // 스티커 — 말풍선 없이 크게. lineHeight 를 주지 않으면 안드로이드에서 이모지가 잘린다
  sticker: { fontSize: 56, lineHeight: 68 },
  // 이미지 스티커 — 이모지 스티커와 비슷한 존재감을 갖도록 정사각형으로
  stickerImage: { width: 132, height: 132 },
  // 가상 터치 — 스티커와 같은 크기 + 아래 제스처 라벨 한 줄
  touchBlock: { alignItems: 'center' },
  touchLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginTop: -4 },
  stickerPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // width:'11.5%' 는 gap 을 계산에 안 넣어 좁은 기기(360dp)에서 한 줄에 7개만
    // 들어가고 남는 폭이 전부 오른쪽에 몰렸다(실측 40px). space-between 이면
    // 그 여백이 줄 안의 아이템 사이 간격으로 고르게 흩어진다.
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  stickerBtn: {
    width: '11.5%',
    aspectRatio: 1,
    minWidth: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerEmoji: { fontSize: 28 },
  stickerBtnImage: { width: 32, height: 32 },
  // 팩이 늘어 한 화면을 넘긴다 — 입력바를 밀어내지 않도록 높이를 묶는다
  stickerScroll: { maxHeight: 220 },
  // 줄 전체를 차지하는 이름표 — space-between 격자 안에서 폭 100%로 줄을 끊는다
  stickerPackLabel: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  stickerPackLabelText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  stickerPackBadge: { fontSize: 9, fontWeight: '800', color: colors.together },
  stickerLocked: { opacity: 0.45 },
  stickerToggleActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  workoutCard: { paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, maxWidth: 240 },
  workoutCardMine: { backgroundColor: colors.secondarySoft, borderColor: colors.secondary },
  workoutCardTheirs: { backgroundColor: colors.surface, borderColor: colors.secondary },
  workoutBadge: { fontSize: fontSize.caption, fontWeight: '800', color: colors.secondary, marginBottom: 2 },
  // PR 카드 — 같은 카드 레이아웃에 골드 강조만 얹는다(couple 토큰 = Gold, 성취를 나타내는 색)
  // 배경은 mePastelBg(파스텔) — 그 위 배지 글자는 couple 원색이면 대비가 안 나와 ink 를 쓴다
  workoutCardPr: { borderColor: colors.couple, backgroundColor: colors.mePastelBg },
  workoutBadgePr: { color: colors.ink },
  workoutText: { fontSize: fontSize.subtitle, color: colors.textPrimary, fontWeight: '600' },
  workoutTextMine: { color: colors.textPrimary },
  streakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    marginVertical: spacing.sm,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    maxWidth: '86%',
  },
  streakBannerText: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    flexShrink: 1,
    textAlign: 'center',
  },
  callCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    maxWidth: 260,
  },
  callCardMine: { backgroundColor: colors.surface, borderColor: colors.border },
  callCardTheirs: { backgroundColor: colors.surface, borderColor: colors.border },
  callCardText: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600', flexShrink: 1 },
  callCardButton: {
    marginLeft: 'auto',
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  callCardButtonText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  mealCard: { paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, maxWidth: 240, gap: 6 },
  mealCardMine: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  mealCardTheirs: { backgroundColor: colors.surface, borderColor: colors.accent },
  // 카드 보더(accent)와 같은 계열로 — 팔레트 밖 앰버는 다크에서 대비가 무너졌다
  mealBadge: { fontSize: fontSize.caption, fontWeight: '800', color: colors.accent },
  // 목표 달성 카드 — 같은 카드 레이아웃에 골드 강조만 얹는다(PR 카드와 같은 톤)
  mealCardGoal: { borderColor: colors.couple, backgroundColor: colors.mePastelBg },
  mealBadgeGoal: { color: colors.ink },
  mealImage: { width: 208, height: 156, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  // inverted 목록의 footer = 맨 위(과거 방향) — 과거 페이지 로딩 스피너
  olderSpinner: { paddingVertical: spacing.md },

  // 연결 끊김 배너 — 목록 위에 얇게 한 줄. 실패를 숨기지 않되 대화를 가리지도 않는다
  offlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  offlineText: { fontSize: fontSize.caption, color: colors.textSecondary },
  time: { fontSize: 10, color: colors.textTertiary },
  editedMark: { fontSize: 10, color: colors.textTertiary },

  // 날짜 구분선 — 가운데 라벨 + 양옆 선
  dateDivider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  dateDividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dateDividerText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textTertiary },

  // 메시지 블록 — 인용/말풍선/리액션을 한 덩어리로 묶는다.
  // 그룹 첫 메시지는 넉넉하게(spaced), 같은 사람이 이어 보낸 메시지는 바짝(grouped) 붙인다
  msgBlock: { maxWidth: '82%' },
  msgBlockSpaced: { marginTop: spacing.sm },
  msgBlockGrouped: { marginTop: spacing.xxs },
  blockMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  blockTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },

  // 인용(답장 원본)
  quote: {
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
    paddingVertical: 2,
    marginBottom: 3,
    maxWidth: '100%',
  },
  quoteMine: { borderLeftColor: colors.coral },
  quoteTheirs: { borderLeftColor: colors.indigo },
  quoteWho: { fontSize: 10, fontWeight: '800', color: colors.textSecondary },
  quoteText: { fontSize: fontSize.caption, color: colors.textSecondary },

  // 삭제된 메시지
  bubbleDeleted: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  deletedText: { fontSize: fontSize.caption, color: colors.textTertiary, fontStyle: 'italic' },

  // 리액션 칩 (말풍선 아래)
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  reactionRowMine: { justifyContent: 'flex-end' },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reactionChipMine: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  reactionChipEmoji: { fontSize: 13 },
  reactionChipCount: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },

  // 답장·수정 배너
  composeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  composeBannerBody: { flex: 1 },
  composeBannerLabel: { fontSize: 10, fontWeight: '800', color: colors.primary },
  composeBannerText: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 1 },
  meta: { marginHorizontal: spacing.xs, justifyContent: 'flex-end' },
  metaMine: { marginHorizontal: spacing.xs, alignItems: 'flex-end', justifyContent: 'flex-end' },
  // 읽음 표시 — 안 읽었을 때만 하트를 띄우고, 읽으면 사라진다(카톡 "1" 방식).
  readHeart: { marginBottom: 2 },
  // 상대 아바타 자리 — 그룹 중간엔 내용 없이 폭만 차지해 말풍선이 계단식으로 안 밀린다
  avatarSlot: { width: 26, marginRight: spacing.xs },
  // 눌림 효과 — 스티커·트레이 버튼 공용(예전엔 "reactionPressed" 로 리액션 바 전용이었다)
  iconPressed: { transform: [{ scale: 0.88 }], backgroundColor: colors.primarySoft },
  // 보조 도구 트레이 — "+" 로 펼치는 스티커/터치/사진 3개
  extrasPanel: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  extraBtn: { width: 64, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: spacing.xs, borderRadius: radius.md },
  extraLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    /*
     * 동그란 "+"/전송 버튼이 화면 맨 끝에 거의 붙어 있으면 기기의 둥근 모서리
     * 곡률에 살짝 잘려 보인다(실기기 확인). safe-area 인셋은 좌우가 대개 0 이라
     * (코너 곡률까지 잡아주진 않는다) 여백을 직접 늘렸다 — 물리적으로 둥근 건
     * 가장자리 전체가 아니라 네 "꼭짓점" 부근이라, 가로(paddingHorizontal)만
     * 늘렸을 때보다 세로(paddingBottom)도 함께 늘리면 버튼이 꼭짓점에서 대각선
     * 으로 더 멀어진다. 위쪽은 꼭짓점과 무관해 기존 값을 유지한다.
     *
     * paddingTop/paddingBottom 은 Between 비교 피드백으로 한 단계씩 더 키웠다
     * (2026-08-31) — 입력 바가 화면 하단에 너무 붙어 촘촘해 보인다는 지적. 아래쪽
     * safe-area 인셋은 SafeAreaView(edges: bottom)가 이미 더해주므로 여기 값은
     * 그 위에 얹히는 순수 여백이다.
     */
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  imageBtn: { width: 46, height: 46, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  /*
   * "+"(24)와 전송(20) 아이콘은 크기가 달라 실제 박스는 둘 다 46x46 로 완전히
   * 같은데도(alignItems/justifyContent: center) 세로 정렬이 어긋나 보였다.
   * 아이콘 폰트는 lineHeight 를 안 정해주면 브라우저가 폰트 자체의 "normal"
   * 줄높이를 쓰는데, 이 여백 비율이 fontSize 에 비례해서 커지므로 크기가
   * 다른 두 아이콘은 같은 상자 안에서도 글리프가 서로 다른 픽셀만큼
   * 위/아래로 밀린다. lineHeight 를 size 와 같게 못박아 그 여백을 없앤다.
   */
  trayIcon: { lineHeight: 24 },
  sendIcon: { lineHeight: 20 },
  input: {
    flex: 1,
    // 웹 필수 — <textarea> 내재 최소 폭 탓에 flex:1 이어도 안 줄어든다
    // (WorkoutSessionScreen.setInput 과 같은 문제). 네이티브에는 영향 없다.
    minWidth: 0,
    maxHeight: 110,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: fontSize.subtitle,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // 텍스트 "전송" 대신 아이콘 하나 — 폭을 아껴 입력창에 더 준다("+" 트레이 통합과 같은 목적)
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
}));
