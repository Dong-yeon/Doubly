/**
 * 프로필 시트 — 한 사람의 사진을 크게 보고, 그 사람의 기록으로 이어 가는 자리
 * (docs/photo-viewing-profile_2026-10-14.md §3, 사용자 결정 2026-10-14).
 *
 * <p>예전엔 상대 사진을 크게 볼 자리가 어디에도 없었다 — 홈 아바타는 누르면 곧장 "○○님의 기록"으로 갔고, 채팅의 작은
 * 아바타·머리 이름은 눌러도 아무 일이 없었다. 이제 셋 다 이 시트를 연다. 홈에서 가던 "기록 보기"는 시트 안 버튼으로 옮겼다.
 *
 * <p>담는 것: 큰 사진(누르면 전체화면) · 이름 · 함께한 날 D+N · 지금 무드와 한마디 · [기록 보기]. 생일은 상대에게 보이지
 * 않는 것이 원칙이라 넣지 않는다. 호출부가 가진 것만 넘긴다 — 없는 줄은 그리지 않는다.
 *
 * <p>전체화면 뷰어는 시트 <b>안에</b> 렌더한다 — 밖에 두면 iOS 에서 시트(Modal) 뒤에 뜬다.
 */
import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Sheet } from './Sheet';
import { Avatar } from './Avatar';
import { ImageViewer } from './ImageViewer';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

/** 시트 가운데 사진 지름 — 아바타 업로드가 1024px 이라(AvatarCropSheet) 3배 화면에서도 무르지 않다 */
const PHOTO = 168;

export interface ProfileSheetPerson {
  name: string;
  imageUrl?: string | null;
  /** 사진이 없을 때 글자 원의 바탕색(나·상대 색) */
  color?: string;
  /** 지금 무드 — 유니코드 또는 우리 이모지 그림, 한마디 */
  mood?: { emoji?: string | null; imageUrl?: string | null; message?: string | null } | null;
}

interface Props {
  /** null 이면 닫힘 */
  person: ProfileSheetPerson | null;
  onClose: () => void;
  /** 함께한 날 D+N — 기념일·연결일이 없으면 넘기지 않는다 */
  dday?: number | null;
  /** [기록 보기] — 호출부가 시트를 닫고 화면을 옮긴다. 없으면 버튼을 그리지 않는다 */
  onOpenRecords?: () => void;
  /** 버튼 글자 — 기본 "○○님의 기록 보기" */
  recordsLabel?: string;
}

export function ProfileSheet({ person, onClose, dday, onOpenRecords, recordsLabel }: Props) {
  const [viewing, setViewing] = useState(false);
  const imageUrl = person?.imageUrl || null;
  const mood = person?.mood;
  const moodMessage = mood?.message?.trim() || null;
  const hasMood = !!(mood?.emoji || mood?.imageUrl || moodMessage);

  const close = () => {
    setViewing(false);
    onClose();
  };

  return (
    <Sheet visible={person !== null} onClose={close} position="bottom">
      {person ? (
        <View style={styles.body}>
          <Pressable
            onPress={() => imageUrl && setViewing(true)}
            disabled={!imageUrl}
            style={({ pressed }) => pressed && styles.pressed}
            accessibilityRole={imageUrl ? 'imagebutton' : 'image'}
            accessibilityLabel={imageUrl ? `${person.name} 프로필 사진 크게 보기` : `${person.name} 프로필`}
          >
            <Avatar name={person.name} imageUrl={imageUrl ?? undefined} size={PHOTO} color={person.color} />
          </Pressable>

          <Text style={styles.name} numberOfLines={1}>
            {person.name}
          </Text>
          {dday != null && dday > 0 ? <Text style={styles.dday}>함께한 지 D+{dday}</Text> : null}

          {hasMood ? (
            <View style={styles.mood}>
              {mood?.imageUrl ? (
                <Image source={{ uri: mood.imageUrl }} style={styles.moodImage} resizeMode="contain" />
              ) : mood?.emoji ? (
                <Text style={styles.moodEmoji}>{mood.emoji}</Text>
              ) : null}
              {moodMessage ? (
                <Text style={styles.moodText} numberOfLines={3}>
                  {moodMessage}
                </Text>
              ) : null}
            </View>
          ) : null}

          {onOpenRecords ? (
            <Pressable
              onPress={() => {
                setViewing(false);
                onOpenRecords();
              }}
              style={({ pressed }) => [styles.recordsBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={recordsLabel ?? `${person.name}님의 기록 보기`}
            >
              <Text style={styles.recordsText}>{recordsLabel ?? `${person.name}님의 기록 보기`}</Text>
            </Pressable>
          ) : null}

          {viewing && imageUrl ? (
            <ImageViewer
              images={[{ key: imageUrl, uri: imageUrl, title: person.name }]}
              initialIndex={0}
              onClose={() => setViewing(false)}
            />
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = themedStyles((colors) => ({
  body: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  pressed: { opacity: 0.75 },
  name: { marginTop: spacing.sm, fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  dday: { fontSize: fontSize.body, fontWeight: '600', color: colors.textSecondary },
  mood: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    maxWidth: '100%',
  },
  moodEmoji: { fontSize: 24, lineHeight: 30 },
  moodImage: { width: 32, height: 32 },
  moodText: { flexShrink: 1, fontSize: fontSize.body, color: colors.textPrimary },
  recordsBtn: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  recordsText: { fontSize: fontSize.body, fontWeight: '800', color: colors.onPrimary },
}));
