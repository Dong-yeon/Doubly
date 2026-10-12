/**
 * 스티커 팩 상세 — 상점에서 카드를 누르면 온다(2026-10-12).
 *
 * <p><b>왜 생겼나</b>: 상점 목록은 대표 그림 한 장과 장수만 보여 주고, 이미 가진 팩은 미리보기도
 * 접는다(StickerShopScreen 주석). 그 대신 "안에 뭐가 들었나"를 볼 자리가 있어야 했는데 없었다 —
 * 낱개 판매를 닫은 뒤로 상점의 카드는 하나도 눌리지 않았다. 서버에서 받는 팩("동물 친구들")은
 * 대표 그림마저 비어 있어서, 사용자는 ▶ 아이콘만 보고 무슨 팩인지 알 수 없었다.
 *
 * <p><b>카카오톡 이모티콘샵 상세의 모양</b>이다: 위에 크게 보기 한 칸, 아래에 전부를 격자로.
 * 격자의 한 장을 누르면 위 칸이 그 장으로 바뀌어 한 번 움직인다. 격자 자체는 움직이지 않는다 —
 * 패널과 같은 판단(animatedStickers 주석: 수십 장을 한꺼번에 재생하면 저사양 기기에서 프레임이 떨어진다).
 *
 * <p><b>아래 단추가 이 팩으로 할 수 있는 일 하나</b>다: 서버 팩은 받기(이모티콘 설정과 같은 흐름 —
 * useRemotePackDownload), 잠긴 팩은 PRO 안내, 값이 붙은 팩은 구매, 나머지는 "바로 쓸 수 있다"는 안내.
 */
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnimatedSticker } from '../../components/AnimatedSticker';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { RemoteAnimatedSticker } from '../../components/RemoteAnimatedSticker';
import { animatedStickerOf } from '../../constants/animatedStickers';
import { STICKER_PURCHASE_ENABLED } from '../../constants/config';
import { packStickersOf, type PackSticker } from '../../constants/stickerPackPreview';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { useRemotePackDownload } from '../../hooks/useRemotePackDownload';
import { usePlanStore } from '../../store/planStore';
import { useRemoteStickerStore } from '../../store/remoteStickerStore';
import { useStickerPrefsStore } from '../../store/stickerPrefsStore';
import { useStickerStore } from '../../store/stickerStore';
import { onColor } from '../../theme/onColor';
import { themedStyles } from '../../theme/themedStyles';
import { Alert } from '../../utils/alert';
import { managedPacks } from '../../utils/stickerPackList';
import type { HomeStackParamList } from '../../navigation/types';
import { PACK_CATEGORY, StatusChip } from './components/StickerPackStatus';

type Props = NativeStackScreenProps<HomeStackParamList, 'StickerPackDetail'>;

/**
 * 격자 한 칸 — 고정 64dp. 패널(46dp)보다 크게 둔다: 패널은 고르는 자리라 많이 보여야 하고,
 * 여기는 <b>구경하는 자리</b>라 표정이 읽혀야 한다. 고정값이라 넓은 화면은 칸이 더 늘어날 뿐이다
 * (StickerPanel.CELL_SIZE 와 같은 판단).
 */
const CELL_SIZE = 64;
const CELL_GAP = spacing.xs;
/** 크게 보기 칸 — 말풍선(132)에 가깝게 */
const STAGE_SIZE = 120;

/**
 * 격자 묶음의 폭 — 들어가는 칸 수만큼만. 이 폭으로 묶음을 가운데 두고 안에서는 왼쪽부터 채운다:
 * 줄 전체를 가운데 정렬하면 마지막 줄만 가운데로 몰려 격자가 흐트러져 보인다.
 */
function gridWidthFor(available: number): number | undefined {
  if (available <= 0) return undefined; // 재기 전 — 일단 꽉 채운다
  const cols = Math.max(1, Math.floor((available + CELL_GAP) / (CELL_SIZE + CELL_GAP)));
  return cols * CELL_SIZE + (cols - 1) * CELL_GAP;
}

export function StickerPackDetailScreen({ navigation, route }: Props) {
  const { packId } = route.params;
  const pack = useStickerStore((s) => s.packs.find((p) => p.id === packId));
  const loadPacks = useStickerStore((s) => s.load);
  const remotePacks = useRemoteStickerStore((s) => s.packs);
  const catalogKnown = useRemoteStickerStore((s) => s.version !== null);
  const downloaded = useStickerPrefsStore((s) => s.downloaded);
  const loadPrefs = useStickerPrefsStore((s) => s.load);
  const showUpgrade = usePlanStore((s) => s.showUpgrade);
  const { progress, download } = useRemotePackDownload();
  const [selected, setSelected] = useState<string | null>(null);
  /** 격자가 쓸 수 있는 폭(안쪽 여백 뺀 값) */
  const [gridSpace, setGridSpace] = useState(0);

  useEffect(() => {
    void loadPacks();
    void loadPrefs();
    void useRemoteStickerStore.getState().refresh();
  }, [loadPacks, loadPrefs]);

  useLayoutEffect(() => {
    if (pack) navigation.setOptions({ title: pack.title });
  }, [navigation, pack]);

  const stickers = useMemo(() => packStickersOf(packId, remotePacks), [packId, remotePacks]);
  // 받기·삭제 단위 — 서버에만 있는 팩인지 여기서 안다
  const managed = useMemo(() => managedPacks(remotePacks).find((p) => p.packId === packId), [remotePacks, packId]);
  const current = stickers.find((s) => s.code === selected) ?? stickers[0];
  const meta = pack ? PACK_CATEGORY[pack.category] : undefined;
  const title = pack?.title ?? managed?.fallbackLabel ?? '이모티콘';

  if (stickers.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {/* 서버 팩은 그림 카탈로그가 와야 그려진다 — 오기 전엔 비었다고 말하지 않는다 */}
        {catalogKnown ? (
          <EmptyState icon="emoticon-outline" title="아직 그림이 없어요" description="곧 이모티콘이 올라와요!" />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  const onBuy = () => {
    if (!pack) return;
    Alert.alert(
      pack.title,
      `${pack.price.toLocaleString()}원에 살 수 있어요.\n\n`
      + '인앱결제가 아직 연결되지 않았어요. 스토어에 상품이 등록되면 바로 구매할 수 있어요.',
    );
  };

  /** 아래 단추 — 이 팩으로 지금 할 수 있는 일 하나 */
  const renderAction = () => {
    if (!pack) return null;
    if (!pack.usable) {
      if (pack.price > 0) {
        return STICKER_PURCHASE_ENABLED ? (
          <Button title={`${pack.price.toLocaleString()}원에 구매`} onPress={onBuy} />
        ) : (
          <Note icon="clock-outline" text={`${pack.price.toLocaleString()}원 · 구매는 준비 중이에요`} />
        );
      }
      return (
        <Button
          title="PRO에서 열려요"
          leftIcon={<MaterialCommunityIcons name="crown" size={18} color={onColor(colors.primaryFill)} />}
          onPress={() => showUpgrade(`'${pack.title}' 팩은 PRO에서 열려요.`)}
        />
      );
    }
    if (managed?.remoteOnly) {
      const done = progress[managed.key];
      if (done !== undefined) {
        return <Button title={`받는 중 ${done}/${managed.urls.length}`} loading />;
      }
      if (downloaded.includes(managed.key)) {
        return <Note icon="check-circle" text="받았어요 · 채팅 이모티콘에서 쓸 수 있어요" />;
      }
      return <Button title="받기 · 무료" onPress={() => void download(managed, title)} />;
    }
    return <Note icon="check-circle" text="채팅 이모티콘에서 바로 쓸 수 있어요" />;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/*
        머리 — 이름·종류·상태, 그리고 크게 보기 한 칸. 격자를 내려도 이 칸은 남는다:
        아래쪽 장을 눌렀는데 크게 보기가 화면 밖에 있으면 누른 보람이 없다.
      */}
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <View style={styles.titleBox}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.meta}>
              {meta ? `${meta.label} · ` : ''}{stickers.length}개
            </Text>
          </View>
          {pack ? <StatusChip pack={pack} /> : null}
        </View>

        {current ? (
          <View style={styles.stage}>
            <StagePreview key={current.code} sticker={current} />
            <Text style={styles.stageLabel} numberOfLines={1}>{current.label}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.gridScroll}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setGridSpace(e.nativeEvent.layout.width - spacing.md * 2)}
      >
        <View style={[styles.grid, { width: gridWidthFor(gridSpace) }]}>
          {stickers.map((s) => {
            const on = s.code === current?.code;
            return (
              <Pressable
                key={s.code}
                onPress={() => setSelected(s.code)}
                style={({ pressed }) => [styles.cell, on && styles.cellOn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${s.label} 크게 보기`}
                accessibilityState={{ selected: on }}
              >
                <Image source={s.thumb} style={styles.cellImage} resizeMode="contain" />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>{renderAction()}</View>
    </SafeAreaView>
  );
}

/**
 * 크게 보기 — 한 번 움직이고 멈춘다(누르면 처음부터). 칸이 바뀔 때마다 {@code key} 로 새로 그려
 * 처음부터 재생한다. 웹은 두 컴포넌트 모두 정지 그림이다(AnimatedSticker.web 주석).
 *
 * <p>서버 팩은 이 한 장의 애니메이션만 받는다 — 말풍선이 받을 때와 같은 파일·같은 보관 자리라
 * 나중에 팩을 받거나 대화에 나와도 다시 받지 않는다(remoteStickerFiles).
 */
function StagePreview({ sticker }: { sticker: PackSticker }) {
  if (sticker.kind === 'animated') {
    const def = animatedStickerOf(sticker.code);
    if (def) return <AnimatedSticker sticker={def} style={styles.stageImage} />;
  }
  if (sticker.kind === 'remoteAnimated') {
    return <RemoteAnimatedSticker code={sticker.code} style={styles.stageImage} />;
  }
  return <Image source={sticker.thumb} style={styles.stageImage} resizeMode="contain" />;
}

function Note({ icon, text }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; text: string }) {
  return (
    <View style={styles.note}>
      <MaterialCommunityIcons name={icon} size={16} color={colors.together} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  head: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  titleBox: { flex: 1, gap: spacing.xxs },
  title: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  meta: { fontSize: fontSize.caption, color: colors.textTertiary, fontWeight: '600' },

  stage: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  stageImage: { width: STAGE_SIZE, height: STAGE_SIZE },
  stageLabel: { fontSize: fontSize.body, fontWeight: '700', color: colors.textSecondary },

  /* 고정 칸 + 줄바꿈 — 폭이 넓을수록 한 줄에 더 많이 선다(gridWidthFor) */
  gridScroll: { padding: spacing.md, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CELL_GAP },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // 고른 칸 — 크게 보기 칸이 무엇을 보여 주는지 격자에서도 찾을 수 있게
  cellOn: { borderColor: colors.primary },
  cellImage: { width: '84%', height: '84%' },
  pressed: { opacity: 0.6 },

  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  noteText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textSecondary },
}));
