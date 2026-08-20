/** 채팅 대화 — 설계서 2.5 / 4.5 CHAT-02 (실시간 메시지) */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '../../components/Icon';
import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '../../navigation/types';
import { ImageViewer } from '../../components/ImageViewer';
import { Avatar } from '../../components/Avatar';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { useRelationStore } from '../../store/relationStore';
import { haptics } from '../../utils/haptics';
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
import {
  applyAllSuggestions,
  applySuggestion,
  checkKoreanSpelling,
} from '../../utils/koreanSpellCheck';
import { chatApi } from '../../api/chat';
import { isPrShareContent } from '../../utils/workoutShare';
import { isGoalShareContent } from '../../utils/dietShare';
import { touchGestureOf } from '../../constants/touchGestures';
import { stickerImageOf } from '../../constants/stickerImages';
import { playTouchGesture } from '../../utils/haptics';
import { messagePreview } from '../../utils/messagePreview';
import { chatDateDividerLabel, isSameLocalDay } from '../../utils/date';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { ChatMessage, TouchGestureCode } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { useAndroidKeyboardHeight } from '../../hooks/useAndroidKeyboardHeight';

/** 스티커 세트 — 말풍선 없이 크게 그려지는 이모지. 커플 대화 감정 표현 위주로 큐레이션 */
const STICKERS = [
  '💕', '😘', '🥰', '😍',
  '🤗', '😆', '😂', '🥹',
  '😴', '😤', '🥺', '😭',
  '👍', '💪', '🎉', '❤️‍🔥',
  // 이미지 스티커 — 값은 이모지가 아니라 StickerImage 코드. 아래 렌더 두 곳(말풍선,
  // 이 패널)이 stickerImageOf() 로 분기해 이미지로 그린다.
  'LOVE_BEAR',
];

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
  const { openRoom, closeRoom, send, markRead, replaceMessage, loadOlder } = useChatStore();
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  // 입력바 보조 도구는 기본으로 숨겨져 있다가 "+"로 펼친다 — 스티커 패널과는
  // 자리를 공유해서 항상 둘 중 하나만 뜬다(토글 핸들러들이 서로를 닫아준다).
  const [showStickers, setShowStickers] = useState(false);
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

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  useEffect(() => {
    openRoom(relationId);
    return () => closeRoom(relationId);
  }, [relationId, openRoom, closeRoom]);

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
      } catch (e) {
        toast.error(getErrorMessage(e, '메시지를 수정하지 못했어요.'));
      } finally {
        setEditSaving(false);
      }
      return;
    }

    const ok = send(relationId, {
      messageType: 'TEXT',
      content,
      replyToId: replyTo?.id,
    });
    if (ok) {
      setText('');
      setReplyTo(null);
      haptics.light();
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

  const sendSticker = (sticker: string) => {
    const ok = send(relationId, { messageType: 'STICKER', content: sticker });
    if (ok) {
      setShowStickers(false);
      haptics.light();
    } else {
      Alert.alert('전송 실패', '연결이 끊겼어요. 잠시 후 다시 시도해주세요.');
    }
  };

  const sendTouch = (code: TouchGestureCode) => {
    const ok = send(relationId, { messageType: 'TOUCH', content: code });
    if (ok) haptics.light();
    else Alert.alert('전송 실패', '연결이 끊겼어요. 잠시 후 다시 시도해주세요.');
  };

  const onPickImage = async () => {
    try {
      const uri = await pickImage();
      if (!uri) return;
      setUploading(true);
      const url = await runBusy('사진 보내는 중…', () => uploadImage(uri));
      const ok = send(relationId, { messageType: 'IMAGE', imageUrl: url });
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
        {/* 시간·읽음·수정 표시는 그룹의 마지막(가장 최근) 메시지에만 — 카톡처럼 한 번만 */}
        {isGroupEnd ? (
          <View style={mine ? styles.metaMine : styles.meta}>
            {/*
              읽음은 내가 보낸 메시지에만 — 상대 메시지의 읽음 여부는 알 필요가 없다.
              "읽음"/"1" 텍스트 대신 하트로 — 채워진 하트=읽음, 테두리만=아직.
              커플 앱 톤에 맞고(비교 벤치마크 앱도 같은 패턴), 10px 텍스트보다 작게
              그려도 뜻이 분명하다.
            */}
            {mine ? (
              <MaterialCommunityIcons
                name={item.isRead ? 'heart' : 'heart-outline'}
                size={11}
                color={item.isRead ? colors.meText : colors.textTertiary}
                style={styles.readHeart}
              />
            ) : null}
            {item.edited ? <Text style={styles.editedMark}>수정됨</Text> : null}
            <Text style={styles.time}>{timeOf(item.createdAt)}</Text>
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
     * 여백 없는 화면들(RegisterScreen 등)과 같은 패턴. 아래 inputBar 의 가로 여백은
     * 별개로 늘렸다 — 화면 모서리가 물리적으로 둥글어서, 세로 인셋만으론 안 잡히는
     * "동그란 버튼이 모서리 곡률에 살짝 잘려 보이는" 문제라 안전 영역과는 무관하다.
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
          <View style={styles.stickerPanel}>
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
            {STICKERS.map((s) => {
              const img = stickerImageOf(s);
              return (
                <Pressable
                  key={s}
                  style={({ pressed }) => [styles.stickerBtn, pressed && styles.iconPressed]}
                  onPress={() => sendSticker(s)}
                  accessibilityRole="button"
                  accessibilityLabel={`스티커 ${img?.label ?? s} 보내기`}
                >
                  {img ? (
                    <Image source={img.source} style={styles.stickerBtnImage} resizeMode="contain" />
                  ) : (
                    <Text style={styles.stickerEmoji}>{s}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
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
              />
            </TouchableOpacity>
          )}
          <TextInput
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
            <MaterialCommunityIcons name="send" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 사진 전체화면 보기 */}
      <ImageViewer
        images={viewingImage ? [{ key: viewingImage, uri: viewingImage }] : []}
        initialIndex={viewingImage ? 0 : null}
        onClose={() => setViewingImage(null)}
      />

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
        onSelect={(emoji) => sendSticker(emoji)}
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
  list: { padding: spacing.md },
  // 그룹 간 세로 간격은 msgBlock(정상 메시지)·row(삭제된 메시지)가 각각 spaced/grouped 로 담당한다
  row: { maxWidth: '80%', flexDirection: 'row', alignItems: 'flex-end' },
  rowMine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  rowTheirs: { alignSelf: 'flex-start' },
  rowSpaced: { marginTop: spacing.sm },
  rowGrouped: { marginTop: spacing.xxs },
  bubble: { paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
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
  stickerToggleActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  workoutCard: { paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, maxWidth: 240 },
  workoutCardMine: { backgroundColor: colors.secondarySoft, borderColor: colors.secondary },
  workoutCardTheirs: { backgroundColor: colors.surface, borderColor: colors.secondary },
  workoutBadge: { fontSize: fontSize.caption, fontWeight: '800', color: colors.secondary, marginBottom: 2 },
  // PR 카드 — 같은 카드 레이아웃에 골드 강조만 얹는다(couple 토큰 = Gold, 성취를 나타내는 색)
  workoutCardPr: { borderColor: colors.couple, backgroundColor: colors.meBg },
  workoutBadgePr: { color: colors.couple },
  workoutText: { fontSize: fontSize.subtitle, color: colors.textPrimary, fontWeight: '600' },
  workoutTextMine: { color: colors.textPrimary },
  mealCard: { paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, maxWidth: 240, gap: 6 },
  mealCardMine: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  mealCardTheirs: { backgroundColor: colors.surface, borderColor: colors.accent },
  // 카드 보더(accent)와 같은 계열로 — 팔레트 밖 앰버는 다크에서 대비가 무너졌다
  mealBadge: { fontSize: fontSize.caption, fontWeight: '800', color: colors.accent },
  // 목표 달성 카드 — 같은 카드 레이아웃에 골드 강조만 얹는다(PR 카드와 같은 톤)
  mealCardGoal: { borderColor: colors.couple, backgroundColor: colors.meBg },
  mealBadgeGoal: { color: colors.couple },
  mealImage: { width: 208, height: 156, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  // inverted 목록의 footer = 맨 위(과거 방향) — 과거 페이지 로딩 스피너
  olderSpinner: { paddingVertical: spacing.md },
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
  // 읽음 표시 — 채워진 하트/테두리 하트로 구분(색은 MaterialCommunityIcons color prop)
  readHeart: { marginBottom: 1 },
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
    // 가로 여백을 세로보다 넉넉히 — 동그란 "+"/전송 버튼이 화면 맨 끝에 거의 붙어
    // 있으면 기기의 둥근 모서리 곡률에 살짝 잘려 보인다(실기기 확인). safe-area
    // 인셋은 좌우가 대개 0 이라(코너 곡률까지 잡아주지 않는다) 여백을 직접 늘렸다.
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  imageBtn: { width: 46, height: 46, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
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
