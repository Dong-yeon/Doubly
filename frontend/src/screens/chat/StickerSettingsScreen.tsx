/**
 * 이모티콘 설정 — 받기·숨기기·순서 바꾸기·삭제 (카카오톡 "이모티콘 설정" 을 따른다, 2026-10-01).
 *
 * <p>위: <b>내 이모티콘</b> — 패널에 서는 팩. ↑↓ 로 순서를, 눈 아이콘으로 숨기기를, 서버 팩은 삭제(기기의
 * 파일을 지우고 "받을 수 있는" 쪽으로 돌린다)를 한다. 아래: <b>받을 수 있는 이모티콘</b> — 서버에만 있고
 * 아직 안 받은 팩.
 *
 * <p>정리는 보내는 쪽(패널)만 바꾼다 — 숨기거나 지운 팩도 받은 말풍선은 그대로 보인다(stickerPrefsStore 주석).
 * 우리 이모지는 여기서 다루지 않는다: 패널 끝에 늘 서고, 만들기·삭제는 그 칸에서 한다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '../../components/Icon';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { onColor } from '../../theme/onColor';
import { useRemoteStickerStore } from '../../store/remoteStickerStore';
import { useStickerStore } from '../../store/stickerStore';
import { applyOrder, useStickerPrefsStore } from '../../store/stickerPrefsStore';
import { managedPacks, type ManagedPack } from '../../utils/stickerPackList';
import { deleteRemoteLotties, downloadRemoteLotties } from '../../utils/remoteStickerFiles';
import { Alert } from '../../utils/alert';
import { toast } from '../../store/toastStore';

export function StickerSettingsScreen() {
  const remotePacks = useRemoteStickerStore((s) => s.packs);
  const packOf = useStickerStore((s) => s.packOf);
  const loadPacks = useStickerStore((s) => s.load);
  const { order, hidden, downloaded, setHidden, move, markDownloaded, markSeen, load } = useStickerPrefsStore();
  /** 받는 중인 팩 → 받은 개수 */
  const [progress, setProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    void load();
    void loadPacks();
    void useRemoteStickerStore.getState().refresh(true);
  }, [load, loadPacks]);

  const all = useMemo(() => managedPacks(remotePacks), [remotePacks]);
  const installed = applyOrder(
    all.filter((p) => !p.remoteOnly || downloaded.includes(p.key)),
    order,
  );
  const available = all.filter((p) => p.remoteOnly && !downloaded.includes(p.key));

  // 이 화면을 열었으면 새 팩을 본 것이다 — 패널 톱니의 점을 끈다
  const remoteKeys = all.filter((p) => p.remoteOnly).map((p) => p.key).join(',');
  useEffect(() => {
    if (remoteKeys) markSeen(remoteKeys.split(','));
  }, [remoteKeys, markSeen]);

  const labelOf = (p: ManagedPack) => (p.packId ? packOf(p.packId)?.title : undefined) ?? p.fallbackLabel;

  const download = async (p: ManagedPack) => {
    setProgress((s) => ({ ...s, [p.key]: 0 }));
    const ok = await downloadRemoteLotties(p.urls, (done) => setProgress((s) => ({ ...s, [p.key]: done })));
    setProgress((s) => {
      const next = { ...s };
      delete next[p.key];
      return next;
    });
    markDownloaded(p.key, true);
    if (ok < p.urls.length) {
      // 반만 받아도 쓸 수는 있다 — 못 받은 장은 처음 보낼 때·받을 때 다시 받는다
      toast.info(`${labelOf(p)} — ${p.urls.length - ok}개는 나중에 받아요`);
    } else {
      toast.success(`${labelOf(p)} 받았어요`);
    }
  };

  const remove = (p: ManagedPack) => {
    Alert.alert(`${labelOf(p)} 삭제`, '이 기기에서 지우고 패널에서 뺄게요. 받은 대화의 이모티콘은 그대로 보여요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deleteRemoteLotties(p.urls);
          markDownloaded(p.key, false);
        },
      },
    ]);
  };

  const keys = installed.map((p) => p.key);
  const visibleCount = installed.filter((p) => !hidden.includes(p.key)).length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.sectionTitle}>내 이모티콘</Text>
        <View style={styles.block}>
          {installed.map((p, i) => {
            const isHidden = hidden.includes(p.key);
            return (
              <View key={p.key} style={[styles.row, i > 0 && styles.divider]}>
                <Image source={p.thumb} style={[styles.thumb, isHidden && styles.dim]} resizeMode="contain" />
                <View style={styles.texts}>
                  <Text style={[styles.name, isHidden && styles.dimText]} numberOfLines={1}>{labelOf(p)}</Text>
                  <Text style={styles.meta}>{isHidden ? `숨김 · ${p.count}개` : `${p.count}개`}</Text>
                </View>
                <IconAction
                  icon="chevron-up"
                  label={`${labelOf(p)} 위로`}
                  disabled={i === 0}
                  onPress={() => move(keys, p.key, -1)}
                />
                <IconAction
                  icon="chevron-down"
                  label={`${labelOf(p)} 아래로`}
                  disabled={i === installed.length - 1}
                  onPress={() => move(keys, p.key, 1)}
                />
                <IconAction
                  icon={isHidden ? 'eye-off-outline' : 'eye-outline'}
                  label={isHidden ? `${labelOf(p)} 보이기` : `${labelOf(p)} 숨기기`}
                  // 마지막 한 팩까지 숨기면 패널이 우리 이모지만 남아 고장처럼 보인다
                  disabled={!isHidden && visibleCount <= 1}
                  onPress={() => setHidden(p.key, !isHidden)}
                />
                {p.remoteOnly ? (
                  <IconAction icon="delete-outline" label={`${labelOf(p)} 삭제`} onPress={() => remove(p)} />
                ) : null}
              </View>
            );
          })}
        </View>
        <Text style={styles.footer}>
          숨기거나 삭제해도 받은 대화의 이모티콘은 그대로 보여요. 우리 이모지는 패널 맨 끝에 있어요.
        </Text>

        <Text style={[styles.sectionTitle, styles.sectionGap]}>받을 수 있는 이모티콘</Text>
        {available.length === 0 ? (
          <Text style={styles.empty}>새 이모티콘이 생기면 여기에 떠요.</Text>
        ) : (
          <View style={styles.block}>
            {available.map((p, i) => {
              const done = progress[p.key];
              return (
                <View key={p.key} style={[styles.row, i > 0 && styles.divider]}>
                  <Image source={p.thumb} style={styles.thumb} resizeMode="contain" />
                  <View style={styles.texts}>
                    <Text style={styles.name} numberOfLines={1}>{labelOf(p)}</Text>
                    <Text style={styles.meta}>
                      {done !== undefined ? `받는 중 ${done}/${p.urls.length}` : `${p.count}개 · 무료`}
                    </Text>
                  </View>
                  {done !== undefined ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Pressable
                      onPress={() => void download(p)}
                      style={({ pressed }) => [styles.getBtn, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`${labelOf(p)} 받기`}
                    >
                      <Text style={styles.getText}>받기</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function IconAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = themedStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  sectionTitle: { fontSize: fontSize.caption, color: c.textSecondary, marginBottom: spacing.sm, marginLeft: spacing.xs },
  sectionGap: { marginTop: spacing.xl },
  block: { backgroundColor: c.surface, borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  divider: { borderTopWidth: 1, borderTopColor: c.border },
  thumb: { width: 40, height: 40, marginRight: spacing.sm },
  dim: { opacity: 0.35 },
  texts: { flex: 1 },
  name: { fontSize: fontSize.body, color: c.textPrimary },
  dimText: { color: c.textSecondary },
  meta: { fontSize: fontSize.caption, color: c.textSecondary, marginTop: 2 },
  iconBtn: { padding: 6 },
  disabled: { opacity: 0.3 },
  pressed: { opacity: 0.6 },
  footer: { fontSize: fontSize.caption, color: c.textSecondary, marginTop: spacing.sm, marginHorizontal: spacing.xs },
  empty: { fontSize: fontSize.caption, color: c.textSecondary, marginHorizontal: spacing.xs },
  getBtn: { backgroundColor: c.primaryFill, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  getText: { fontSize: fontSize.caption, color: onColor(c.primaryFill), fontWeight: '600' },
}));
