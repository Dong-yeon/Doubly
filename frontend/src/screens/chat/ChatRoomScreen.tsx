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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '../../navigation/types';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { haptics } from '../../utils/haptics';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { EmojiPicker } from '../../components/EmojiPicker';
import { SpellCheckBar } from '../../components/SpellCheckBar';
import { useSettingsStore } from '../../store/settingsStore';
import { applySuggestion, checkKoreanSpelling } from '../../utils/koreanSpellCheck';
import { chatApi } from '../../api/chat';
import { isPrShareContent } from '../../utils/workoutShare';
import { isGoalShareContent } from '../../utils/dietShare';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { ChatMessage } from '../../types';

const REACTIONS = ['💗', '🔥', '💪', '👍', '🎉'];

/** 스티커 세트 — 말풍선 없이 크게 그려지는 이모지. 커플 대화 감정 표현 위주로 큐레이션 */
const STICKERS = [
  '💕', '😘', '🥰', '😍',
  '🤗', '😆', '😂', '🥹',
  '😴', '😤', '🥺', '😭',
  '👍', '💪', '🎉', '❤️‍🔥',
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

export function ChatRoomScreen({ navigation, route }: Props) {
  const { relationId, title } = route.params;
  const myId = useAuthStore((s) => s.user?.id);
  const messages = useChatStore((s) => s.messages[relationId] ?? EMPTY_MESSAGES);
  const { openRoom, closeRoom, send, markRead, replaceMessage } = useChatStore();
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  // 답장 대상 / 수정 중인 메시지 / 리액션 피커 대상
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [reactingTo, setReactingTo] = useState<ChatMessage | null>(null);
  const [showEmojiSheet, setShowEmojiSheet] = useState(false);
  // 맞춤법 제안을 닫은 시점의 입력값 — 글을 더 치면(값이 달라지면) 다시 뜬다
  const [spellDismissedFor, setSpellDismissedFor] = useState<string | null>(null);
  const spellCheckEnabled = useSettingsStore((s) => s.spellCheckEnabled);
  // 이미 읽음 처리한 최대 메시지 id — 중복 PUT 방지
  const markedUpToRef = useRef(0);

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
    if (latestIncoming && latestIncoming.id > markedUpToRef.current) {
      markedUpToRef.current = latestIncoming.id;
      markRead(latestIncoming.id).catch(() => {
        markedUpToRef.current = 0; // 실패 시 다음 변경에서 재시도
      });
    }
  }, [messages, myId, markRead]);

  const onSend = async () => {
    const content = text.trim();
    if (!content) return;

    // 수정 모드 — 전송 대신 기존 메시지를 고친다
    if (editing) {
      try {
        const updated = await chatApi.edit(editing.id, content);
        replaceMessage(relationId, updated);
        setEditing(null);
        setText('');
        haptics.light();
      } catch (e) {
        toast.error(getErrorMessage(e, '메시지를 수정하지 못했어요.'));
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

  /** 메시지 길게 누르기 — 리액션/답장/수정/삭제 */
  const onLongPressMessage = (msg: ChatMessage) => {
    if (msg.deleted) return;
    haptics.light();
    const mine = msg.senderId === myId;
    const actions: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: '리액션 달기', onPress: () => setReactingTo(msg) },
      { text: '답장하기', onPress: () => { setEditing(null); setReplyTo(msg); } },
    ];
    // 수정은 내가 보낸 텍스트만 (사진·스티커는 고칠 내용이 없다)
    if (mine && msg.messageType === 'TEXT') {
      actions.push({
        text: '수정하기',
        onPress: () => { setReplyTo(null); setEditing(msg); setText(msg.content ?? ''); },
      });
    }
    if (mine) {
      actions.push({ text: '삭제하기', style: 'destructive', onPress: () => onDelete(msg) });
    }
    actions.push({ text: '취소', style: 'cancel' });
    Alert.alert('메시지', undefined, actions);
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

  const sendReaction = (emoji: string) => {
    const ok = send(relationId, { messageType: 'TEXT', content: emoji });
    if (ok) haptics.light();
    else Alert.alert('전송 실패', '연결이 끊겼어요. 잠시 후 다시 시도해주세요.');
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

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const mine = item.senderId === myId;
    const isImage = item.messageType === 'IMAGE' && !!item.imageUrl;
    const isSticker = item.messageType === 'STICKER';
    const isWorkout = item.messageType === 'WORKOUT_CARD';
    const isMeal = item.messageType === 'MEAL_CARD';
    // PR(자기 최고 기록) 공유 카드 — 문구 접두어로 구분한다(workoutShare.ts, 단일 출처)
    const isPr = isWorkout && isPrShareContent(item.content);
    // 영양 목표 달성 공유 카드 — 문구 접두어로 구분한다(dietShare.ts, 단일 출처)
    const isGoal = isMeal && isGoalShareContent(item.content);
    // 삭제된 메시지는 자리만 남기고 내용을 감춘다 (답장·리액션 참조가 살아있다)
    if (item.deleted) {
      return (
        <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
          <View style={[styles.bubble, styles.bubbleDeleted]}>
            <Text style={styles.deletedText}>삭제된 메시지예요</Text>
          </View>
          <Text style={styles.time}>{timeOf(item.createdAt)}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.msgBlock, mine ? styles.blockMine : styles.blockTheirs]}>
        {/* 인용한 원본 — 말풍선 위에 한 줄 */}
        {item.replyTo ? (
          <View style={[styles.quote, mine ? styles.quoteMine : styles.quoteTheirs]}>
            <Text style={styles.quoteWho}>
              {item.replyTo.senderId === myId ? '나' : title}에게 답장
            </Text>
            <Text style={styles.quoteText} numberOfLines={1}>
              {item.replyTo.content ?? '삭제된 메시지'}
            </Text>
          </View>
        ) : null}

        <Pressable
          onLongPress={() => onLongPressMessage(item)}
          delayLongPress={300}
          style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}
        >
        {isSticker ? (
          <Text style={styles.sticker}>{item.content}</Text>
        ) : isImage ? (
          <Image source={{ uri: item.imageUrl! }} style={styles.msgImage} resizeMode="cover" />
        ) : isWorkout ? (
          <View style={[
            styles.workoutCard,
            mine ? styles.workoutCardMine : styles.workoutCardTheirs,
            isPr && styles.workoutCardPr,
          ]}>
            <Text style={[styles.workoutBadge, isPr && styles.workoutBadgePr]}>
              {isPr ? 'PR 달성 🔥' : '운동 기록'}
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
              <Image source={{ uri: item.imageUrl }} style={styles.mealImage} resizeMode="cover" />
            ) : null}
            {item.content ? (
              <Text style={styles.workoutText}>{item.content}</Text>
            ) : null}
          </View>
        ) : (
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
            <Text style={[styles.msgText, mine && styles.msgTextMine]}>{item.content}</Text>
          </View>
        )}
        <View style={mine ? styles.metaMine : styles.meta}>
          {/* 읽음은 내가 보낸 메시지에만 — 상대 메시지의 읽음 여부는 알 필요가 없다 */}
          {mine ? (
            <Text style={[styles.read, item.isRead && styles.readDone]}>
              {item.isRead ? '읽음' : '1'}
            </Text>
          ) : null}
          {item.edited ? <Text style={styles.editedMark}>수정됨</Text> : null}
          <Text style={styles.time}>{timeOf(item.createdAt)}</Text>
        </View>
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
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          style={styles.flex}
          data={messages}
          inverted
          keyExtractor={(m) => String(m.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
        <View style={styles.reactions}>
          {REACTIONS.map((e) => (
            <Pressable
              key={e}
              style={({ pressed }) => [styles.reactionBtn, pressed && styles.reactionPressed]}
              onPress={() => sendReaction(e)}
            >
              <Text style={styles.reactionEmoji}>{e}</Text>
            </Pressable>
          ))}
        </View>
        {showStickers ? (
          <View style={styles.stickerPanel}>
            <Pressable
              style={({ pressed }) => [styles.stickerBtn, pressed && styles.reactionPressed]}
              onPress={() => { setShowStickers(false); setShowEmojiSheet(true); }}
              accessibilityRole="button"
              accessibilityLabel="이모지 더 보기"
            >
              <MaterialCommunityIcons name="dots-horizontal" size={24} color={colors.textSecondary} />
            </Pressable>
            {STICKERS.map((s) => (
              <Pressable
                key={s}
                style={({ pressed }) => [styles.stickerBtn, pressed && styles.reactionPressed]}
                onPress={() => sendSticker(s)}
                accessibilityRole="button"
                accessibilityLabel={`스티커 ${s} 보내기`}
              >
                <Text style={styles.stickerEmoji}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {/* 답장·수정 중 배너 — 무엇에 대해 쓰고 있는지 보여주고 취소할 수 있게 */}
        {replyTo || editing ? (
          <View style={styles.composeBanner}>
            <View style={styles.composeBannerBody}>
              <Text style={styles.composeBannerLabel}>
                {editing ? '메시지 수정 중' : '답장'}
              </Text>
              <Text style={styles.composeBannerText} numberOfLines={1}>
                {(editing ?? replyTo)?.content ?? '사진'}
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
          onDismiss={() => setSpellDismissedFor(text)}
        />
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={[styles.imageBtn, showStickers && styles.stickerToggleActive]}
            onPress={() => setShowStickers((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="스티커 선택"
          >
            <MaterialCommunityIcons
              name="sticker-emoji"
              size={22}
              color={showStickers ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.imageBtn} onPress={onPickImage} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialCommunityIcons name="camera-outline" size={22} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="메시지를 입력하세요"
            placeholderTextColor={colors.textSecondary}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !text.trim() && styles.sendDisabled]}
            onPress={onSend}
            disabled={!text.trim()}
          >
            <Text style={styles.sendText}>전송</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  list: { padding: spacing.md },
  row: { marginVertical: spacing.xs, maxWidth: '80%', flexDirection: 'row', alignItems: 'flex-end' },
  rowMine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  rowTheirs: { alignSelf: 'flex-start' },
  bubble: { paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  msgText: { fontSize: fontSize.subtitle, color: colors.textPrimary, lineHeight: 21 },
  msgTextMine: { color: colors.white },
  msgImage: { width: 200, height: 200, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  // 스티커 — 말풍선 없이 크게. lineHeight 를 주지 않으면 안드로이드에서 이모지가 잘린다
  sticker: { fontSize: 56, lineHeight: 68 },
  stickerPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  mealBadge: { fontSize: fontSize.caption, fontWeight: '800', color: '#E0A020' },
  // 목표 달성 카드 — 같은 카드 레이아웃에 골드 강조만 얹는다(PR 카드와 같은 톤)
  mealCardGoal: { borderColor: colors.couple, backgroundColor: colors.meBg },
  mealBadgeGoal: { color: colors.couple },
  mealImage: { width: 208, height: 156, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  time: { fontSize: 10, color: colors.textTertiary },
  editedMark: { fontSize: 10, color: colors.textTertiary },

  // 메시지 블록 — 인용/말풍선/리액션을 한 덩어리로 묶는다
  msgBlock: { marginVertical: spacing.xs, maxWidth: '82%' },
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
  // 안 읽음은 카카오톡처럼 "1", 읽으면 "읽음" — 색으로도 구분한다
  read: { fontSize: 10, fontWeight: '800', color: colors.coral, marginBottom: 1 },
  readDone: { color: colors.textTertiary, fontWeight: '600' },
  reactions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  reactionBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionPressed: { transform: [{ scale: 0.88 }], backgroundColor: colors.primarySoft },
  reactionEmoji: { fontSize: 20 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  imageBtn: { width: 46, height: 46, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  imageBtnText: { fontSize: 20 },
  input: {
    flex: 1,
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
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: colors.white, fontWeight: '800' },
});
