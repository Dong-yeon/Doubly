/**
 * 채팅 말풍선 아래 "럽슐랭에 추가할까요?" 칩 — 지도 링크(utils/placeLinkHosts)가 붙은 텍스트 메시지에만.
 *
 * <p>모달이 아니라 말풍선 아래 한 줄이다. 대화를 가로막지 않고, 안 쓰면 그냥 지나친다. 보낸 사람·받은 사람
 * 모두에게 보인다 — 링크를 보낸 쪽이 "이거 담아 두자"를 바로 누를 수도 있다.
 *
 * <p>칩은 문자열만 보고 그린다. 서버(해석)는 눌렀을 때만 부른다 — {@link PlaceLinkSheet}.
 * 닫기(X)는 이 메시지에서만 감춘다(placeLinkChipStore).
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../Icon';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

interface Props {
  /** 내 말풍선 아래면 오른쪽에 붙인다 */
  mine: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}

export function PlaceLinkChip({ mine, onOpen, onDismiss }: Props) {
  return (
    <View style={[styles.row, mine ? styles.rowMine : null]}>
      <View style={styles.chip}>
        <Pressable
          onPress={onOpen}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="이 장소를 럽슐랭에 추가하기"
          hitSlop={{ top: 6, bottom: 6 }}
        >
          <MaterialCommunityIcons name="map-marker-plus-outline" size={15} color={colors.togetherText} />
          <Text style={styles.label} numberOfLines={1}>
            럽슐랭에 추가할까요?
          </Text>
        </Pressable>
        {/*
          닫기 — 칩 안의 둘째 버튼이다. 칩 전체를 하나의 Pressable 로 감싸면 웹에서 버튼 안 버튼이 된다
          (npm run verify:nested-buttons). 그래서 바깥은 View, 안에 형제 버튼 둘.
        */}
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="럽슐랭 추가 제안 닫기"
          hitSlop={{ top: 8, bottom: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="close" size={14} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  row: { flexDirection: 'row', marginTop: spacing.xxs, paddingHorizontal: spacing.xs },
  rowMine: { justifyContent: 'flex-end' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 260,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.togetherBg,
    // 터치 영역은 hitSlop 으로 넓힌다 — 칩 자체는 말풍선 아래 보조 줄이라 낮게
    minHeight: Math.min(32, layout.touchTarget),
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xxs,
    paddingVertical: spacing.xxs,
    flexShrink: 1,
  },
  label: { fontSize: fontSize.caption, fontWeight: '700', color: colors.togetherText, flexShrink: 1 },
  close: { paddingLeft: spacing.xxs, paddingRight: spacing.sm, paddingVertical: spacing.xxs },
  pressed: { opacity: 0.6 },
}));
