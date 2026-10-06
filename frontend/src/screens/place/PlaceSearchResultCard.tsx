/**
 * 지도 위 검색 결과 한 곳 — 이름·카테고리·주소 + [럽슐랭에 담기].
 *
 * <p>결과는 아직 우리 장소가 아니다(지도에서는 물방울 모양 임시 핀). 담기를 누르면 바로 저장되고 임시 핀이 우리 핀으로
 * 바뀐다 — 예전엔 장소 추가 화면에서 결과를 고른 뒤 [저장]을 한 번 더 눌러야 했다(docs/lovechelin-current-state.md ⑥-2).
 * 카드 본문은 누를 수 있는 버튼이 아니다(지도에서 그 결과로 옮겨 가기만 한다) — 버튼은 [담기] 하나다.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { PlaceSearchResult } from '../../types';
import { placeSubtitle } from '../../utils/placeLinks';

interface Props {
  result: PlaceSearchResult;
  saving: boolean;
  /** 결과 카드를 눌렀다 — 지도에서 그 핀으로 옮긴다(좌표가 없으면 안 준다) */
  onFocus?: () => void;
  onAdd: () => void;
}

/** 결과 하나를 가리키는 열쇠 — 카카오 id 가 있으면 그것, 없으면 이름+주소 */
export function searchResultKey(r: PlaceSearchResult): string {
  return r.kakaoPlaceId ?? `${r.name}|${r.address ?? ''}`;
}

export function PlaceSearchResultCard({ result, saving, onFocus, onAdd }: Props) {
  const info = (
    <>
      <Text style={styles.name} numberOfLines={1}>
        {result.name}
      </Text>
      {/* "한식 · 냉면 · 연남동" — 무엇을 파는 곳인지 + 동네 */}
      {placeSubtitle(result) ? <Text style={styles.category}>{placeSubtitle(result)}</Text> : null}
      {result.address ? (
        <Text style={styles.address} numberOfLines={1}>
          {result.address}
        </Text>
      ) : null}
    </>
  );
  return (
    <View style={styles.card}>
      {onFocus ? (
        <Pressable
          onPress={onFocus}
          style={({ pressed }) => [styles.info, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${result.name} 지도에서 보기`}
        >
          {info}
        </Pressable>
      ) : (
        <View style={styles.info}>{info}</View>
      )}
      <Button
        title={saving ? '담는 중…' : '럽슐랭에 담기'}
        size="sm"
        onPress={onAdd}
        disabled={saving}
        accessibilityLabel={`${result.name} 럽슐랭에 담기`}
      />
    </View>
  );
}

const styles = themedStyles((colors) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    // 우리 장소 카드와 다른 테두리 — 아직 담지 않은 검색 결과다
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  info: { flex: 1, gap: spacing.xxs },
  pressed: { opacity: 0.7 },
  name: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  category: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  address: { fontSize: fontSize.caption, color: colors.textSecondary },
}));
