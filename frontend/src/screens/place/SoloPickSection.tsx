/**
 * "내 픽 · 상대 픽" 섹션 — PlaceScreen 의 가이드/콘텐츠 두 모드가 완전히 같은 구조로 쓴다.
 *
 * <p><b>왜 가로 스크롤을 버렸나</b>: 원래는 `<ScrollView horizontal>` 한 줄이라 픽이 쌓일수록
 * 옆으로 한없이 길어져 몇 개가 더 있는지 알 수 없고 손가락으로 계속 밀어야 했다. 이제는
 * 카드가 가로로 꽉 차게 줄바꿈(wrap)되고, {@link PREVIEW_COUNT}개를 넘으면 "더보기"를 눌러야
 * 나머지가 펼쳐진다 — 그마저도 무한정 화면을 늘리지 않도록 펼친 부분만 최대 높이를 두고
 * 스크롤되게 한다.
 */
import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

/** 미리보기로 보여줄 카드 수 — 이 이상은 "더보기"를 눌러야 보인다 */
const PREVIEW_COUNT = 6;
/** 펼쳤을 때 이 이상 늘어나지 않고 이 높이 안에서 스크롤된다 */
const EXPANDED_MAX_HEIGHT = 360;

export function SoloPickSection<T>({
  title,
  subtitle,
  items,
  keyExtractor,
  renderCard,
}: {
  title: string;
  subtitle: string;
  items: T[];
  keyExtractor: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const hasMore = items.length > PREVIEW_COUNT;
  const visible = expanded ? items : items.slice(0, PREVIEW_COUNT);

  const grid = (
    <View style={styles.grid}>
      {visible.map((item) => (
        <View key={keyExtractor(item)}>{renderCard(item)}</View>
      ))}
    </View>
  );

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {/* 펼친 상태에서만 스크롤 박스로 감싼다 — 접혀있을 땐 PREVIEW_COUNT 로 이미 높이가 짧다 */}
      {expanded && hasMore ? (
        <ScrollView style={styles.scrollBox} nestedScrollEnabled>
          {grid}
        </ScrollView>
      ) : (
        grid
      )}
      {hasMore ? (
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} hitSlop={8} style={styles.moreButton}>
          <Text style={styles.moreText}>
            {expanded ? '접기' : `더보기 (${items.length - PREVIEW_COUNT}개 더)`}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, marginBottom: spacing.sm },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  scrollBox: { maxHeight: EXPANDED_MAX_HEIGHT },
  moreButton: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  moreText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
}));
