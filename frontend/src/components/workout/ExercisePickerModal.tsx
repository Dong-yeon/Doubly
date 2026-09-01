/**
 * 부위 → 기구 순으로 좁혀가며 종목 카탈로그에서 운동을 고르는 모달.
 *
 * <p>운동 기록 추가·루틴 만들기(대체 종목)·세션 중 종목 교체 — 세 화면 모두 "카탈로그에서
 * 운동을 고른다"는 같은 일을 하면서 각자 UI를 따로 구현하고 있었다. 이 모달 하나로
 * 합치되, 고르는 방식만 두 가지를 지원한다: 기본은 하나 고르면 바로 알려주는 단일 선택
 * (운동 기록 추가·종목 교체), {@link Props.multiSelect} 를 넘기면 여러 개를 체크로
 * 골랐다 뺐다 할 수 있는 다중 선택(루틴의 대체 종목 최대 N개)이 된다.
 *
 * <p>카탈로그가 수십 건뿐이라 호출부가 이미 통째로 받아온 목록을 그대로
 * 넘겨받아 여기서 전부 클라이언트 필터링한다 — 모달을 열 때마다 새로 요청하지 않는다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Button } from '../Button';
import { Chip } from '../Chip';
import { MUSCLE_GROUPS } from '../../constants/workout';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { equipmentOptionsIn, searchCatalog } from '../../utils/exerciseCatalog';
import { haptics } from '../../utils/haptics';
import type { ExerciseCatalogItem } from '../../types';

interface MultiSelectConfig {
  selectedIds: number[];
  max: number;
  onToggle: (item: ExerciseCatalogItem) => void;
}

interface Props {
  visible: boolean;
  catalog: ExerciseCatalogItem[];
  onClose: () => void;
  /** 이 이름은 후보에서 뺀다 — 대체 종목 탐색에서 원본 종목 자신이 뜨는 걸 막는 용도 */
  excludeName?: string;
  /** 단일 선택(기본) — 고르면 바로 호출된다. 닫는 건 호출부 몫(선택 직후 화면이 바뀌는 경우가 많아서). */
  onSelect?: (item: ExerciseCatalogItem) => void;
  /** 다중 선택 — 넘기면 탭할 때마다 체크 토글만 하고 모달은 열려있다. "완료"로 직접 닫는다. */
  multiSelect?: MultiSelectConfig;
  /** 카탈로그에 원하는 종목이 없을 때의 폴백 — 없으면 그 유도 문구 자체를 숨긴다(대체 종목처럼 자유 입력이 없는 곳) */
  onFreeInput?: () => void;
}

const ALL_EQUIPMENT = '전체';

export function ExercisePickerModal({ visible, catalog, onClose, excludeName, onSelect, multiSelect, onFreeInput }: Props) {
  const [group, setGroup] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string>(ALL_EQUIPMENT);
  const [query, setQuery] = useState('');

  // 열 때마다 처음부터 — 지난번 골랐던 부위가 남아있으면 "부위 먼저 선택" 흐름이 흐트러진다
  useEffect(() => {
    if (visible) {
      setGroup(null);
      setEquipment(ALL_EQUIPMENT);
      setQuery('');
    }
  }, [visible]);

  /*
   * 검색 중에는 부위·기구 칩을 접는다.
   *
   * 카탈로그가 34개일 땐 부위→기구로 좁히는 것만으로 충분했지만, 245개가 되면 부위 하나에
   * 30~45개라 스크롤이 길다. 그리고 사람들은 애초에 "벤치"라고 친다 — 그때 부위를 먼저
   * 고르라고 하면 "풀오버가 등인가 가슴인가"를 사용자가 알아야 한다.
   */
  const searching = query.trim().length > 0;

  const groupItems = useMemo(() => {
    if (!group) return [];
    return catalog.filter((c) => c.muscleGroup === group && c.name !== excludeName);
  }, [catalog, group, excludeName]);

  // 이 부위에 실제로 있는 기구만 칩으로 보여준다 — 없는 기구를 골랐다가 매번 빈 결과를 보는 걸 막는다
  const equipmentOptions = useMemo(() => equipmentOptionsIn(groupItems), [groupItems]);

  const results = useMemo(() => {
    if (searching) {
      return searchCatalog(catalog, query).filter((c) => c.name !== excludeName);
    }
    if (equipment === ALL_EQUIPMENT) return groupItems;
    return groupItems.filter((c) => (c.equipment ?? '맨몸') === equipment);
  }, [searching, catalog, query, excludeName, groupItems, equipment]);

  const selectGroup = (g: string) => {
    haptics.light();
    setGroup(g);
    setEquipment(ALL_EQUIPMENT);
  };

  const pressItem = (item: ExerciseCatalogItem) => {
    haptics.light();
    if (multiSelect) {
      multiSelect.onToggle(item);
      return;
    }
    onSelect?.(item);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>운동 선택</Text>
          {multiSelect ? (
            <Text style={styles.multiCount}>
              {multiSelect.selectedIds.length} / {multiSelect.max}개 선택됨
            </Text>
          ) : null}

          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="운동 검색 (예: 벤치, 턱걸이)"
            placeholderTextColor={colors.textTertiary}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="운동 검색"
          />

          {searching ? null : (
            <>
              <Text style={styles.label}>부위</Text>
              <View style={styles.chipRow}>
                {MUSCLE_GROUPS.map((g) => (
                  <Chip key={g} label={g} selected={group === g} onPress={() => selectGroup(g)} />
                ))}
              </View>
            </>
          )}

          {!searching && !group ? (
            <Text style={styles.hint}>부위를 고르거나 위에서 검색해보세요.</Text>
          ) : (
            <>
              {searching ? null : (
                <>
                  <Text style={styles.label}>기구</Text>
                  <View style={styles.chipRow}>
                    <Chip label={ALL_EQUIPMENT} selected={equipment === ALL_EQUIPMENT} onPress={() => setEquipment(ALL_EQUIPMENT)} />
                    {equipmentOptions.map((e) => (
                      <Chip key={e} label={e} selected={equipment === e} onPress={() => setEquipment(e)} />
                    ))}
                  </View>
                </>
              )}

              {searching ? (
                <Text style={styles.searchMeta}>
                  전체에서 {results.length}개 — 부위와 상관없이 찾아요
                </Text>
              ) : null}
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {results.length === 0 ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>
                      {searching ? `'${query.trim()}' 로 찾은 운동이 없어요.` : '이 조합엔 등록된 운동이 없어요.'}
                    </Text>
                    {onFreeInput ? (
                      <TouchableOpacity onPress={onFreeInput}>
                        <Text style={styles.freeInputLink}>직접 입력하기 ›</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : (
                  results.map((item) => {
                    const selected = multiSelect?.selectedIds.includes(item.id) ?? false;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.item, selected && styles.itemSelected]}
                        onPress={() => pressItem(item)}
                        accessibilityState={{ selected }}
                      >
                        <Text style={styles.itemEmoji}>{item.emoji ?? '🏋️'}</Text>
                        <View style={styles.flex}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemMeta}>
                            {item.muscleGroup} · {item.equipment ?? '맨몸'}
                          </Text>
                          {/* 동작 설명 — 고르는 시점이야말로 "이게 무슨 운동인지" 가장 모르는 순간이다.
                              목록이라 두 줄로 자른다(전문은 세션 카드에서 본다). */}
                          {item.description ? (
                            <Text style={styles.itemDesc} numberOfLines={2}>
                              {item.description}
                            </Text>
                          ) : null}
                        </View>
                        {selected ? <Text style={styles.itemCheck}>✓</Text> : null}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </>
          )}

          {multiSelect ? (
            <Button title="완료" onPress={onClose} style={styles.doneBtn} />
          ) : onFreeInput ? (
            <TouchableOpacity style={styles.freeInputBtn} onPress={onFreeInput}>
              <Text style={styles.freeInputBtnText}>찾는 운동이 없어요 — 직접 입력할게요</Text>
            </TouchableOpacity>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, maxHeight: '80%' },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  multiCount: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginTop: -spacing.xs, marginBottom: spacing.sm },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceAlt,
  },
  searchMeta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },

  label: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.xs, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  hint: { fontSize: fontSize.caption, color: colors.textTertiary, marginTop: spacing.md, marginBottom: spacing.sm },
  flex: { flex: 1 },
  list: { marginTop: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.xs,
  },
  itemSelected: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  itemEmoji: { fontSize: fontSize.subtitle },
  itemName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  itemMeta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  // 부위·기구(itemMeta)보다 한 단계 옅게 — 이름 → 태그 → 설명 순으로 읽히게 한다
  itemDesc: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 3, lineHeight: 17 },
  itemCheck: { fontSize: fontSize.body, color: colors.primary, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.xs },
  emptyText: { fontSize: fontSize.caption, color: colors.textSecondary },
  freeInputLink: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  freeInputBtn: { marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.xs },
  freeInputBtnText: { fontSize: fontSize.caption, color: colors.textTertiary, fontWeight: '600' },
  doneBtn: { marginTop: spacing.md },
}));
