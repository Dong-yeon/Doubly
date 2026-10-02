/**
 * 채팅방 "더보기" 시트 — 사진 모아보기 · 저장한 대화 · 채팅 배경.
 *
 * <p><b>사진 줄</b>(2026-10-02): "사진 모아보기" 아래에 최근 사진을 가로 한 줄로 깐다. 카톡 방 정보 화면 실측
 * (docs/CHAT_KAKAO_MEASURE_2026-10-01.md §4) — 정사각 57 · 간격 3.7 · 한 줄에 5.8장. 마지막 장이 잘려 보여야
 * 옆으로 넘길 수 있다는 것이 읽힌다. 글자 한 줄로는 "사진이 있는지"조차 열어 봐야 알았다.
 *
 * 헤더에 아이콘을 하나씩 늘리면 좁은 기기에서
 * 겹친다(HomeScreen QuickActions 폭 예산 주석과 같은 문제). 자주 안 쓰는 항목들을
 * "⋮" 하나로 묶는다 — MessageActionSheet 와 같은 바텀시트 구조.
 */
import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from './Icon';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { layout } from '../theme/layout';
import { chatApi } from '../api/chat';
import { thumbnailUrl } from '../utils/imageUrl';
import type { ChatMessage } from '../types';

/** 사진 줄 칸 — 카톡 실측 57·3.7 을 앱 스케일로(56·spacing.xs) */
const THUMB = 56;
/** 줄에 싣는 최대 장수 — 첫 페이지에서 자른다. 더 보려면 "사진 모아보기"로 간다 */
const STRIP_MAX = 12;
/**
 * 방별 마지막 결과 — 시트를 다시 열 때 빈 줄에서 시작해 튀지 않게 한다. 열 때마다 새로 받아 갈아 끼운다.
 * 앱을 다시 켜면 비어 있고, 그 첫 열기만 자리를 비워 둔 채 기다린다.
 */
const stripCache = new Map<number, ChatMessage[]>();

interface Props {
  visible: boolean;
  onClose: () => void;
  relationId: number;
  onPhotos: () => void;
  /** 사진 줄에서 한 장을 눌렀다 — 모아보기 화면을 그 장을 연 채로 연다 */
  onPhoto: (messageId: number) => void;
  onSaved: () => void;
  onScheduled: () => void;
  onExport: () => void;
  onBackground: () => void;
}

export function ChatMoreMenuSheet({
  visible,
  onClose,
  relationId,
  onPhotos,
  onPhoto,
  onSaved,
  onScheduled,
  onExport,
  onBackground,
}: Props) {
  /*
   * 시트는 Modal 안이라 화면의 SafeAreaView 밖이다 — 인셋을 직접 받아야 한다.
   * 네 줄일 때는 paddingBottom(32)만으로 안드로이드 3버튼 바를 넘겼는데,
   * "채팅 배경"이 다섯째로 붙으면서 마지막 줄이 바에 잘렸다(2026-09-23 실기기).
   */
  const insets = useSafeAreaInsets();
  const go = (action: () => void) => {
    onClose();
    action();
  };

  /*
   * 사진 줄 — 시트를 열 때마다 첫 페이지를 받는다. null 은 "아직 모름"(자리를 비워 둔다), 빈 배열은
   * "사진 없음"(줄을 접는다). 실패하면 줄만 접는다 — 메뉴 시트에서 토스트로 막을 일은 아니다.
   */
  const [strip, setStrip] = useState<ChatMessage[] | null>(() => stripCache.get(relationId) ?? null);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    chatApi
      .photos(relationId)
      .then((page) => {
        const photos = page.filter((p) => !!p.imageUrl).slice(0, STRIP_MAX);
        stripCache.set(relationId, photos);
        if (alive) setStrip(photos);
      })
      .catch(() => {
        if (alive) setStrip((prev) => prev ?? []);
      });
    return () => {
      alive = false;
    };
  }, [visible, relationId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Row icon="image-multiple-outline" label="사진 모아보기" onPress={() => go(onPhotos)} />
          {strip === null ? (
            // 첫 열기 — 줄 높이만큼 자리를 지켜 응답이 왔을 때 아래 줄들이 밀려 내려가지 않게
            <View style={styles.stripPlaceholder} />
          ) : strip.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.strip}
              contentContainerStyle={styles.stripRow}
            >
              {strip.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => go(() => onPhoto(p.id))}
                  style={({ pressed }) => pressed && styles.thumbPressed}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="사진 크게 보기"
                >
                  {/* 썸네일 — 원본을 깔면 시트를 열 때마다 수 MB 를 받는다(모아보기 화면과 같은 규칙) */}
                  <Image source={{ uri: thumbnailUrl(p.imageUrl!, THUMB * 2) }} style={styles.thumb} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <Row icon="bookmark-outline" label="저장한 대화" onPress={() => go(onSaved)} />
          <Row icon="clock-outline" label="예약된 메시지" onPress={() => go(onScheduled)} />
          <Row icon="export-variant" label="대화 내보내기" onPress={() => go(onExport)} />
          {/* 2026-09-23 에 설정에서 이리로 옮겨 왔다 — 이유는 ChatBackgroundSheet 상단 주석 */}
          <Row icon="palette-outline" label="채팅 배경" onPress={() => go(onBackground)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
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
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.textPrimary} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  // 시트 좌우 여백(md)을 뚫고 화면 끝까지 — 마지막 장이 가장자리에서 잘려야 넘길 수 있다는 게 보인다
  strip: { marginHorizontal: -spacing.md, marginBottom: spacing.xs },
  stripRow: { gap: spacing.xs, paddingHorizontal: spacing.md },
  stripPlaceholder: { height: THUMB + spacing.xs },
  // 모서리 6 — 56 칸에 radius.sm(10)은 동그랗게 읽힌다. 카톡 실측도 각진 정사각에 가깝다
  thumb: { width: THUMB, height: THUMB, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  thumbPressed: { opacity: 0.6 },
  label: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
}));
