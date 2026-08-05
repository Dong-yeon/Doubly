/**
 * 이모지 피커 — 카테고리 탭 + 검색.
 *
 * 스티커 이미지 없이도 표현력을 넓히기 위한 것. 이미지 에셋·라이선스가 필요 없고
 * 시스템 이모지 폰트로 그려지므로 용량도 늘지 않는다.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';

interface EmojiEntry {
  char: string;
  /** 검색 키워드 (한글) */
  keywords: string;
}

interface Category {
  key: string;
  label: string;
  emojis: EmojiEntry[];
}

const e = (char: string, keywords: string): EmojiEntry => ({ char, keywords });

/**
 * 커플 대화에서 실제로 쓰일 만한 것 위주로 큐레이션했다.
 * 전체 유니코드 이모지를 넣으면 목록이 수천 개가 되어 오히려 찾기 어렵다.
 */
const CATEGORIES: Category[] = [
  {
    key: 'love',
    label: '사랑',
    emojis: [
      e('❤️', '하트 사랑 빨강'), e('🩷', '하트 분홍'), e('🩵', '하트 하늘'), e('💜', '하트 보라'),
      e('💕', '하트 두개 사랑'), e('💖', '반짝 하트'), e('💘', '화살 하트'), e('❤️‍🔥', '불타는 하트'),
      e('😘', '뽀뽀 키스'), e('🥰', '사랑 행복'), e('😍', '하트눈 반함'), e('🫶', '손하트'),
      e('🤗', '포옹 안기'), e('💑', '커플'), e('💐', '꽃다발'), e('🌹', '장미 꽃'),
    ],
  },
  {
    key: 'happy',
    label: '기쁨',
    emojis: [
      e('😀', '웃음 기쁨'), e('😄', '웃음 활짝'), e('😆', '웃음 크게'), e('😂', 'ㅋㅋ 눈물 웃음'),
      e('🤣', 'ㅋㅋㅋ 폭소'), e('🙂', '미소'), e('😊', '흐뭇 미소'), e('😉', '윙크'),
      e('🥳', '축하 파티'), e('🎉', '축하 파티 폭죽'), e('✨', '반짝'), e('👏', '박수'),
      e('👍', '좋아요 엄지'), e('🙌', '만세'), e('💯', '백점 최고'), e('🔥', '불 대박'),
    ],
  },
  {
    key: 'sad',
    label: '슬픔·화남',
    emojis: [
      e('🥺', '부탁 애원'), e('😢', '눈물 슬픔'), e('😭', '엉엉 울음'), e('😞', '실망'),
      e('😔', '시무룩'), e('😩', '지침 힘듦'), e('😮‍💨', '한숨'), e('🥹', '감동 울컥'),
      e('😤', '씩씩 화남'), e('😡', '화남 분노'), e('😠', '화남'), e('🙄', '눈굴리기'),
      e('😅', '식은땀 민망'), e('😳', '당황'), e('🥶', '추움'), e('🥵', '더움'),
    ],
  },
  {
    key: 'daily',
    label: '일상',
    emojis: [
      e('😴', '잠 졸림'), e('🤔', '고민 생각'), e('🙏', '부탁 감사'), e('👌', '오케이'),
      e('🙆', '동그라미 맞음'), e('🙅', '엑스 아님'), e('🤷', '몰라 글쎄'), e('👀', '눈 봐봐'),
      e('💪', '운동 근육 힘'), e('🏃', '달리기 운동'), e('🚶', '걷기 산책'), e('🧘', '요가 명상'),
      e('☀️', '맑음 해'), e('🌙', '밤 달'), e('☔', '비'), e('❄️', '눈 겨울'),
    ],
  },
  {
    key: 'food',
    label: '음식',
    emojis: [
      e('🍚', '밥 식사'), e('🍜', '라면 국수'), e('🍕', '피자'), e('🍔', '햄버거'),
      e('🍗', '치킨 닭'), e('🍣', '초밥 스시'), e('🥗', '샐러드'), e('🍰', '케이크 디저트'),
      e('🍦', '아이스크림'), e('☕', '커피'), e('🧋', '버블티 음료'), e('🍺', '맥주 술'),
      e('🍷', '와인 술'), e('🍎', '사과 과일'), e('🍓', '딸기'), e('🎂', '생일 케이크'),
    ],
  },
  {
    key: 'travel',
    label: '여행',
    emojis: [
      e('✈️', '비행기 여행'), e('🚗', '자동차 드라이브'), e('🚌', '버스'), e('🚄', '기차 KTX'),
      e('🏖️', '해변 바다'), e('⛰️', '산 등산'), e('🏕️', '캠핑'), e('🎡', '놀이공원'),
      e('🗺️', '지도 계획'), e('📸', '사진 카메라'), e('🎫', '티켓 예약'), e('🏨', '호텔 숙소'),
      e('🌊', '바다 파도'), e('🌸', '벚꽃 봄'), e('🍁', '단풍 가을'), e('🎄', '크리스마스'),
    ],
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  /** 헤더 문구 — 리액션 선택과 스티커 전송에서 다르게 쓴다 */
  title?: string;
}

export function EmojiPicker({ visible, onClose, onSelect, title = '이모지 선택' }: Props) {
  const [tab, setTab] = useState(CATEGORIES[0].key);
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = query.trim();
    // 검색 중에는 카테고리를 무시하고 전체에서 찾는다
    if (q) {
      const all = CATEGORIES.flatMap((c) => c.emojis);
      return all.filter((x) => x.keywords.includes(q) || x.char === q);
    }
    return CATEGORIES.find((c) => c.key === tab)?.emojis ?? [];
  }, [tab, query]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        {/* onPress 로 탭을 흡수한다 — 없으면 시트 빈 곳 터치가 배경으로 새어나가 닫힌다 */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>

          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="검색 (예: 하트, 웃음, 커피)"
            placeholderTextColor={colors.textTertiary}
          />

          {query.trim() ? null : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c.key}
                  style={[styles.tab, tab === c.key && styles.tabActive]}
                  onPress={() => setTab(c.key)}
                >
                  <Text style={[styles.tabText, tab === c.key && styles.tabTextActive]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <ScrollView contentContainerStyle={styles.grid}>
            {shown.length === 0 ? (
              <Text style={styles.empty}>검색 결과가 없어요</Text>
            ) : (
              shown.map((x) => (
                <Pressable
                  key={x.char}
                  style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
                  onPress={() => {
                    onSelect(x.char);
                    close();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={x.keywords}
                >
                  <Text style={styles.emoji}>{x.char}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: '70%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.subtitle,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  search: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  tabs: { marginTop: spacing.sm, flexGrow: 0 },
  tab: {
    paddingHorizontal: spacing.md,
    height: 34,
    justifyContent: 'center',
    borderRadius: radius.pill,
    marginRight: spacing.xs,
    backgroundColor: colors.surfaceAlt,
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: spacing.sm },
  cell: {
    width: '12.5%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  cellPressed: { backgroundColor: colors.surfaceAlt, transform: [{ scale: 0.9 }] },
  emoji: { fontSize: 28, lineHeight: 34 },
  empty: {
    width: '100%',
    textAlign: 'center',
    color: colors.textSecondary,
    paddingVertical: spacing.xl,
  },
});
