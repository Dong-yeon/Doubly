/**
 * 채팅 배경 고르기 — <b>채팅방 안</b>의 ⋮ 메뉴에서 연다.
 *
 * <p>2026-09-23 까지는 설정 화면에 앱 테마·액센트와 나란히 있었다. 같은 높이에 색 목록이
 * 둘이라 "왜 색을 두 번 고르지"가 됐는데, 둘은 층이 다르다 — 액센트는 앱 전체 정체성이고
 * 이건 이 방의 취향이다. 쓰는 자리로 옮긴다(chatTheme.ts 상단 주석).
 *
 * <p>견본은 <b>지금 보고 있는 스킴</b>으로 그린다. 그리고 정적 배열이 아니라
 * {@link chatPalette} 을 거친다 — '기본' 테마의 내 말풍선은 앱 액센트를 따라가므로
 * 정적 값을 그리면 민트를 고른 사람의 '기본' 칩만 초록으로 남는다.
 */
import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from './Icon';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { layout } from '../theme/layout';
import { getScheme } from '../theme/colors';
import { CHAT_THEMES, chatPalette } from '../theme/chatTheme';
import { useChatThemeStore } from '../store/chatThemeStore';
import { CAN_USE_CHAT_PHOTO, pickChatBackgroundPhoto } from '../utils/chatBackgroundPhoto';
import { toast } from '../store/toastStore';
import { getErrorMessage } from '../utils/error';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ChatBackgroundSheet({ visible, onClose }: Props) {
  // Modal 은 화면의 SafeAreaView 밖이다 — 안드로이드 내비 바에 마지막 줄이 잘린다
  const insets = useSafeAreaInsets();
  const scheme = getScheme();
  const themeId = useChatThemeStore((s) => s.id);
  const photoUri = useChatThemeStore((s) => s.photoUri);
  const setTheme = useChatThemeStore((s) => s.setTheme);
  const setPhoto = useChatThemeStore((s) => s.setPhoto);
  const clearPhoto = useChatThemeStore((s) => s.clearPhoto);
  const [picking, setPicking] = useState(false);

  const onPickPhoto = async () => {
    // 피커가 뜨는 동안 두 번 눌리면 파일이 둘 생기고 하나는 주인을 잃는다
    if (picking) return;
    setPicking(true);
    try {
      const uri = await pickChatBackgroundPhoto();
      if (uri) await setPhoto(uri);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 배경으로 쓰지 못했어요.'));
    } finally {
      setPicking(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]}
          onPress={() => {}}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>채팅 배경</Text>
          <Text style={styles.desc}>이 기기에서만 바뀌어요. 상대 화면은 그대로예요.</Text>

          {CAN_USE_CHAT_PHOTO ? (
            <View style={styles.photoRow}>
              <Pressable
                style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}
                onPress={() => void onPickPhoto()}
                disabled={picking}
                accessibilityRole="button"
                accessibilityLabel="사진을 배경으로 쓰기"
              >
                <MaterialCommunityIcons
                  name="image-plus"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.photoButtonText}>
                  {picking ? '불러오는 중…' : photoUri ? '사진 바꾸기' : '사진 고르기'}
                </Text>
              </Pressable>
              {photoUri ? (
                <Pressable
                  style={({ pressed }) => [styles.photoClear, pressed && styles.pressed]}
                  onPress={() => void clearPhoto()}
                  accessibilityRole="button"
                  accessibilityLabel="사진 배경 지우기"
                >
                  <Text style={styles.photoClearText}>사진 빼기</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {photoUri ? (
            /*
             * 사진은 테마를 대체하지 않고 배경만 덮는다 — 아래 목록은 그대로 살아 있고,
             * 고르는 테마가 말풍선·글자를 정한다. 그 관계를 글로 한 번 말해 준다.
             */
            <View style={styles.photoNote}>
              <Image source={{ uri: photoUri }} style={styles.photoThumb} contentFit="cover" />
              <Text style={styles.photoNoteText}>
                사진 위에 아래에서 고른 말풍선이 얹혀요.
              </Text>
            </View>
          ) : null}

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {CHAT_THEMES.map((t) => {
              const preview = chatPalette(scheme, t.id);
              const selected = themeId === t.id;
              return (
                <Pressable
                  key={t.id}
                  style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                  onPress={() => void setTheme(t.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`채팅 배경 ${t.label}`}
                >
                  {/* 실제 화면의 축소판 — 배경 위에 상대(왼쪽)·나(오른쪽) 말풍선 */}
                  <View
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: preview.background,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={[styles.swatchTheirs, { backgroundColor: preview.bubbleTheirs }]} />
                    <View style={[styles.swatchMine, { backgroundColor: preview.bubbleMine }]} />
                  </View>
                  <Text style={[styles.label, selected && styles.labelOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    // 열 벌 + 사진 줄이 화면을 다 먹지 않게 — 넘치면 아래 목록만 구른다
    maxHeight: '72%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  desc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },

  photoRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  photoButtonText: { fontSize: fontSize.body, fontWeight: '700', color: colors.primary },
  photoClear: {
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  photoClearText: { fontSize: fontSize.body, color: colors.textSecondary },

  photoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  photoThumb: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  photoNoteText: { flex: 1, fontSize: fontSize.caption, color: colors.textSecondary },

  list: { marginTop: spacing.md },
  listContent: {
    flexDirection: 'row',
    // 좁은 기기(360dp)에서는 한 줄에 다 안 들어가 여러 줄로 접힌다
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  item: { alignItems: 'center', gap: 4 },
  // borderWidth 를 선택 여부와 무관하게 2로 고정한다 — 1↔2 로 바꾸면 고를 때마다
  // 안쪽 말풍선이 1px 씩 움직여 보인다. 색만 바꾼다.
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    padding: 6,
    justifyContent: 'center',
    gap: 4,
  },
  swatchTheirs: { width: 22, height: 8, borderRadius: 4, alignSelf: 'flex-start' },
  swatchMine: { width: 26, height: 8, borderRadius: 4, alignSelf: 'flex-end' },
  label: { fontSize: fontSize.micro, color: colors.textSecondary },
  labelOn: { color: colors.primary, fontWeight: '700' },
  pressed: { opacity: Platform.OS === 'ios' ? 0.6 : 0.85 },
}));
