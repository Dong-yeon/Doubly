/**
 * AI 맛집 추천 결과 카드 — AiInsightButton 모달 안에서 렌더링된다.
 *
 * <p>추천 장소는 카카오 로컬 검색에서 온 실존 장소라 이름·주소·좌표가 정확하다.
 * "럽슐랭에 추가" 원탭이 핵심 — 추천 → 등록 → 방문 → 평가 → 더 정교한 추천으로 이어지는
 * 고리를 만든다(위시리스트/방문 같은 상태 구분은 2026-08-28 럽슐랭 단순화로 없앴다 —
 * docs/LOVELICHELIN_IA_SIMPLIFICATION.md, 이제는 그냥 등록만 한다). render prop 이
 * 함수가 아니라 컴포넌트인 이유는 담기 진행/완료 상태(state)가 필요해서다.
 */
import React, { useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../../components/Button';
import { placeApi } from '../../api/place';
import { usePlaceStore } from '../../store/placeStore';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { fontSize, radius, spacing } from '../../constants/theme';
import type { LovelichelinRecommendation, LovelichelinRecommendedPlace } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

export function LovelichelinRecommendCards({ data }: { data: LovelichelinRecommendation }) {
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [savingName, setSavingName] = useState<string | null>(null);

  if (!data.available) {
    return (
      <Text style={styles.empty}>
        아직 인증된 럽슐랭 장소가 없어요. 함께 다녀온 곳에 둘 다 평점을 매기면, 취향에 딱 맞는 새
        맛집을 추천해드려요!
      </Text>
    );
  }

  const onAdd = async (place: LovelichelinRecommendedPlace) => {
    setSavingName(place.name);
    try {
      await placeApi.save({
        name: place.name,
        address: place.address ?? undefined,
        lat: place.lat ?? undefined,
        lng: place.lng ?? undefined,
        category: place.category ?? undefined,
      });
      haptics.success();
      toast.success('럽슐랭에 추가했어요!');
      // 모달을 닫고 돌아간 목록/지도가 새 장소를 반영하게
      usePlaceStore.getState().invalidate();
      setSavedNames((prev) => [...prev, place.name]);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSavingName(null);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      {data.greeting ? <Text style={styles.greeting}>{data.greeting}</Text> : null}
      {data.places.length === 0 ? (
        <Text style={styles.empty}>이번엔 조건에 맞는 새 장소를 찾지 못했어요. 잠시 후 다시 시도해주세요.</Text>
      ) : (
        data.places.map((p) => {
          const saved = savedNames.includes(p.name);
          return (
            <View key={`${p.name}-${p.lat ?? ''}`} style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                </Text>
                {p.category ? (
                  <View style={styles.categoryChip}>
                    <Text style={styles.categoryText}>{p.category}</Text>
                  </View>
                ) : null}
              </View>
              {p.address ? <Text style={styles.address}>{p.address}</Text> : null}
              {p.reason ? <Text style={styles.reason}>💡 {p.reason}</Text> : null}
              <View style={styles.actionRow}>
                {p.placeUrl ? (
                  <TouchableOpacity onPress={() => Linking.openURL(p.placeUrl!)} hitSlop={8}>
                    <Text style={styles.mapLink}>카카오맵에서 보기</Text>
                  </TouchableOpacity>
                ) : (
                  <View />
                )}
                <Button
                  title={saved ? '추가했어요 ✓' : '럽슐랭에 추가'}
                  size="sm"
                  variant={saved ? 'soft' : 'primary'}
                  disabled={saved}
                  loading={savingName === p.name}
                  onPress={() => onAdd(p)}
                />
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  greeting: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 22 },
  empty: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 22 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  categoryChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  address: { fontSize: fontSize.caption, color: colors.textSecondary },
  reason: { fontSize: fontSize.caption, color: colors.textPrimary, lineHeight: 18 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  mapLink: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
}));
