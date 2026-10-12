/**
 * 스티커 팩의 카테고리 이름표와 상태 칩 — 상점 목록과 팩 상세가 같이 쓴다(2026-10-12 에 상점에서 뺐다).
 */
import React from 'react';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { STICKER_PURCHASE_ENABLED } from '../../../constants/config';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';
import type { StickerPack } from '../../../types';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * 카테고리 — 한국어 이름과 아이콘.
 *
 * <p>서버 enum 을 그대로 보여줄 수는 없고, 아이콘이 있으면 <b>그림 없는 팩</b>(무드·터치)도
 * 카드가 비어 보이지 않는다. 그 둘은 유니코드/제스처라 썸네일이 없다.
 */
export const PACK_CATEGORY: Record<StickerPack['category'], { label: string; icon: IconName }> = {
  ANIMATED: { label: '움직이는 이모티콘', icon: 'play-circle' },
  IMAGE: { label: '캐릭터 스티커', icon: 'emoticon-outline' },
  MOOD: { label: '무드', icon: 'face-woman-shimmer-outline' },
  TOUCH: { label: '가상 터치', icon: 'hand-heart-outline' },
};

/**
 * 오른쪽 한 칸이 상태 전부다 — 무료 / 보유 / 구매함 / 가격 / PRO.
 *
 * <p>다섯을 한자리에 모으는 이유는 목록을 훑을 때 눈이 <b>한 열만</b> 따라가면 되게
 * 하기 위해서다. 상태마다 다른 자리에 두면 카드마다 눈이 다시 헤맨다.
 */
export function StatusChip({ pack }: { pack: StickerPack }) {
  if (!pack.proOnly && pack.price === 0) {
    return (
      <View style={[styles.chip, styles.chipFree]}>
        <Text style={[styles.chipText, styles.chipFreeText]}>무료</Text>
      </View>
    );
  }
  if (pack.usable) {
    return (
      <View style={[styles.chip, styles.chipOwned]}>
        <MaterialCommunityIcons name="check-circle" size={12} color={colors.together} />
        <Text style={[styles.chipText, styles.chipOwnedText]}>
          {pack.purchased ? '구매완료' : '보유'}
        </Text>
      </View>
    );
  }
  if (pack.price > 0) {
    /*
     * 값은 보여주되, 아직 못 사면 그것도 같이 적는다(`STICKER_PURCHASE_ENABLED`).
     * 값만 붙여 두면 살 수 있다는 약속이 되고, 눌렀을 때 못 사면 그게 곧 배신이다.
     */
    return (
      <View style={[styles.chip, styles.chipPrice]}>
        <Text style={[styles.chipText, styles.chipPriceText]}>
          {pack.price.toLocaleString()}원{STICKER_PURCHASE_ENABLED ? '' : ' · 준비 중'}
        </Text>
      </View>
    );
  }
  // 가격이 없는 잠긴 팩 = 구독으로만 열린다. 지금 시드에는 없지만 스키마가 허용한다
  // (확장 무드·프리미엄 터치는 price = 1200 이라 위 갈래로 간다 — V96 시드)
  return (
    <View style={[styles.chip, styles.chipPro]}>
      <MaterialCommunityIcons name="crown" size={12} color={colors.primary} />
      <Text style={[styles.chipText, styles.chipProText]}>PRO</Text>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  chipText: { fontSize: fontSize.caption, fontWeight: '800' },
  chipFree: { backgroundColor: colors.surfaceAlt },
  chipFreeText: { color: colors.textSecondary },
  chipOwned: { backgroundColor: colors.togetherBg },
  chipOwnedText: { color: colors.together },
  chipPrice: { backgroundColor: colors.primary },
  chipPriceText: { color: colors.onPrimary },
  chipPro: { backgroundColor: colors.primaryBg },
  chipProText: { color: colors.primary },
}));
