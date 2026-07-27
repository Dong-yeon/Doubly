/** 채팅 대화 — 설계서 2.5 / 4.5 CHAT-02 (실시간 메시지) */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const { openRoom, closeRoom, send, markRead } = useChatStore();
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  // 이미 읽음 처리한 최대 메시지 id — 중복 PUT 방지
  const markedUpToRef = useRef(0);

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

  const onSend = () => {
    const content = text.trim();
    if (!content) return;
    const ok = send(relationId, { messageType: 'TEXT', content });
    if (ok) {
      setText('');
      haptics.light();
    } else {
      Alert.alert('전송 실패', '연결이 끊겼어요. 잠시 후 다시 시도해주세요.');
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
    return (
      <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
        {isSticker ? (
          <Text style={styles.sticker}>{item.content}</Text>
        ) : isImage ? (
          <Image source={{ uri: item.imageUrl! }} style={styles.msgImage} resizeMode="cover" />
        ) : isWorkout ? (
          <View style={[styles.workoutCard, mine ? styles.workoutCardMine : styles.workoutCardTheirs]}>
            <Text style={styles.workoutBadge}>운동 기록</Text>
            <Text style={[styles.workoutText, mine && styles.workoutTextMine]}>{item.content}</Text>
          </View>
        ) : isMeal ? (
          <View style={[styles.mealCard, mine ? styles.mealCardMine : styles.mealCardTheirs]}>
            <Text style={styles.mealBadge}>식단</Text>
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
          <Text style={styles.time}>{timeOf(item.createdAt)}</Text>
        </View>
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
  workoutText: { fontSize: fontSize.subtitle, color: colors.textPrimary, fontWeight: '600' },
  workoutTextMine: { color: colors.textPrimary },
  mealCard: { paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, maxWidth: 240, gap: 6 },
  mealCardMine: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  mealCardTheirs: { backgroundColor: colors.surface, borderColor: colors.accent },
  mealBadge: { fontSize: fontSize.caption, fontWeight: '800', color: '#E0A020' },
  mealImage: { width: 208, height: 156, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  time: { fontSize: 10, color: colors.textTertiary },
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
