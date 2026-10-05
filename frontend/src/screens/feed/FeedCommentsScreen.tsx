/**
 * 일상 댓글(V124) — 기록 카드의 "댓글 N"에서 연다. 이모지 반응으로는 못 하는 짧은 말을 그 기록 옆에 남긴다.
 *
 * <p>오래된 댓글이 위, 새 댓글이 아래(대화처럼 읽힌다). 입력은 바닥에 붙어 있고 보내면 맨 아래로 내려간다.
 * 내 댓글을 길게 누르면 지운다(고치기는 없다 — 두 사람 사이의 짧은 말이라 지우고 다시 쓴다).
 * 쓰면 상대에게 푸시가 간다(서버 FeedCommentService). 화면에 들어올 때마다 다시 읽는다.
 *
 * <p>키보드 처리는 채팅방과 같다 — iOS 는 KeyboardAvoidingView(헤더 높이만큼 오프셋), Android 는
 * edge-to-edge 아래에서 자동 보정이 먹지 않아 실측 키보드 높이만큼 직접 띄운다(ChatRoomScreen 주석).
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AlbumStackParamList } from '../../navigation/types';
import { MaterialCommunityIcons } from '../../components/Icon';
import { feedApi } from '../../api/feed';
import type { FeedComment } from '../../types';
import { useAndroidKeyboardHeight } from '../../hooks/useAndroidKeyboardHeight';
import { feedTimeLabel } from './FeedTimelineScreen';
import { Alert } from '../../utils/alert';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<AlbumStackParamList, 'FeedComments'>;

/** 서버 상한(CreateCommentRequest @Size(max = 500))과 맞춘다 */
const MAX_COMMENT = 500;

export function FeedCommentsScreen({ route }: Props) {
  const { postId } = route.params;
  const headerHeight = useHeaderHeight();
  const androidKeyboardHeight = useAndroidKeyboardHeight();
  const listRef = useRef<FlatList<FeedComment>>(null);

  const [comments, setComments] = useState<FeedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // 두 번 눌러 같은 댓글이 두 번 가지 않게 — state 는 다음 렌더까지 늦다(FeedComposeScreen 과 같은 처방)
  const sendingRef = useRef(false);

  const load = useCallback(() => {
    let active = true;
    setLoadError(false);
    feedApi
      .comments(postId)
      .then((list) => {
        if (active) setComments(list);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [postId]);
  useFocusEffect(load);

  const onSend = async () => {
    const content = text.trim();
    if (!content || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const saved = await feedApi.addComment(postId, content);
      setComments((prev) => [...prev, saved]);
      setText('');
      haptics.light();
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      toast.error(getErrorMessage(e, '댓글을 남기지 못했어요.'));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const onLongPress = (comment: FeedComment) => {
    if (!comment.mine) return;
    Alert.alert('댓글을 지울까요?', undefined, [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: () =>
          feedApi
            .removeComment(comment.id)
            .then(() => setComments((prev) => prev.filter((c) => c.id !== comment.id)))
            .catch((e) => toast.error(getErrorMessage(e, '댓글을 지우지 못했어요.'))),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={[styles.flex, Platform.OS === 'android' && { paddingBottom: androidKeyboardHeight }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={comments}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {loadError ? '댓글을 불러오지 못했어요. 다시 들어와 주세요.' : '첫 댓글을 남겨 보세요.'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onLongPress={() => onLongPress(item)}
                delayLongPress={400}
                style={[styles.comment, item.mine && styles.commentMine]}
                accessibilityHint={item.mine ? '길게 누르면 지울 수 있어요' : undefined}
              >
                <View style={styles.commentHeader}>
                  <Text style={[styles.author, { color: item.mine ? colors.me : colors.partner }]}>
                    {item.mine ? '나' : item.authorName}
                  </Text>
                  <Text style={styles.time}>{feedTimeLabel(item.createdAt)}</Text>
                </View>
                <Text style={styles.content}>{item.content}</Text>
              </Pressable>
            )}
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="댓글 남기기"
            placeholderTextColor={colors.textTertiary}
            maxLength={MAX_COMMENT}
            multiline
            accessibilityLabel="댓글 입력"
          />
          <Pressable
            onPress={onSend}
            disabled={!text.trim() || sending}
            style={({ pressed }) => [styles.send, (!text.trim() || sending) && styles.sendOff, pressed && styles.pressed]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="댓글 보내기"
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <MaterialCommunityIcons name="send" size={18} color={colors.onPrimary} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  empty: { color: colors.textSecondary, fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.xl },
  comment: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
    maxWidth: '88%',
  },
  commentMine: { alignSelf: 'flex-end', backgroundColor: colors.surfaceAlt },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  author: { fontSize: fontSize.caption, fontWeight: '800' },
  time: { fontSize: fontSize.caption, color: colors.textMuted },
  content: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 22 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendOff: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
}));
