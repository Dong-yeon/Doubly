/**
 * 홈 · 더보기 시트 — 바로가기 줄의 마지막 칸에서 열린다.
 *
 * <p><b>왜 생겼나.</b> 바로가기가 4칸에서 7칸까지 늘었다(스도쿠 추가, 2026-09-09).
 * 홈은 스크롤이 없어(HomeScreen 상단 주석) 세로로 늘릴 수 없으니 새 기능이 전부 이 한 줄에
 * 가로로 쌓였고, 320px 기기에서 칸당 45px·라벨 11px 까지 내려왔다. 다음 기능이 오면 8칸이다.
 * 칸을 3개로 줄이고 나머지를 여기로 모으면 <b>그 압력이 끊긴다</b> — 다음 기능은 이 목록에
 * 한 줄로 들어온다. 분석은 docs/HOME_SCREEN_ANALYSIS_2026-09-12.md.
 *
 * <p><b>무엇을 내렸나.</b> 질문·게임은 <b>전용 푸시 링크가 있다</b>
 * ({@code PushLinks.QUESTION}·{@code GAME_SUDOKU}·{@code GAME_OMOK}) — 제품이 이미 "알림으로
 * 불러들이는 기능"으로 취급하므로 홈 최상단을 늘 점유할 이유가 약하다. 사진첩은 "피드에 올린
 * 사진을 한 곳에 모아본다"(PhotoAlbumScreen 주석)라 <b>우리 기록과 같은 데이터의 다른 뷰</b>다.
 *
 * <p><b>여행은 반대로 승격이다.</b> 화면이 7개(TripList~TripRecap)인데 홈에서 갈 길이 없었다 —
 * 여행 중이나 D-day 때만 뜨는 조건부 한 줄이 전부였고, TripList 로 가는 인앱 경로는 앱 전체에서
 * 캘린더 안의 링크 하나뿐이었다(CoupleCalendarScreen). 여기 들어오면서 처음으로 상시 입구를 갖는다.
 *
 * <p><b>터치는 여기 두고 채팅으로 옮기지 않는다.</b> 이 진입점의 존재 이유가 "채팅방을 열지
 * 않고도 보낸다"였다(HomeScreen 의 TouchGesturePicker 주석). 채팅으로 옮기면 그 전제가 사라진다.
 * 목록 맨 아래 구분선 밑에 두는 건 성격이 달라서다 — 화면 이동이 아니라 그 자리에서 보내는 동작이다.
 */
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';
import { layout } from '../../../theme/layout';

interface Props {
  visible: boolean;
  onClose: () => void;
  onQuestion: () => void;
  onGames: () => void;
  onPhotoAlbum: () => void;
  onTrips: () => void;
  onTouch: () => void;
}

export function HomeMoreSheet({
  visible,
  onClose,
  onQuestion,
  onGames,
  onPhotoAlbum,
  onTrips,
  onTouch,
}: Props) {
  /** 고른 뒤 시트를 닫는다 — 돌아왔을 때 시트가 떠 있으면 뒤로가기가 두 번 필요하다 */
  const pick = (go: () => void) => () => {
    onClose();
    go();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>더보기</Text>
          </View>

          <Row
            icon="comment-question-outline"
            label="오늘의 질문"
            desc="하루 한 번, 둘이 각자 답해요"
            onPress={pick(onQuestion)}
          />
          <Row icon="gamepad-variant-outline" label="게임" desc="스도쿠 · 오목" onPress={pick(onGames)} />
          <Row
            icon="image-multiple-outline"
            label="사진첩"
            desc="올린 사진을 한 곳에서 봐요"
            onPress={pick(onPhotoAlbum)}
          />
          <Row icon="airplane" label="여행" desc="일정 · 체크리스트 · 경비" onPress={pick(onTrips)} />

          <View style={styles.divider} />

          {/* 화면을 옮기는 게 아니라 그 자리에서 보내는 동작이라 구분선 아래에 둔다 */}
          <Row
            icon="hand-heart-outline"
            label="터치 보내기"
            desc="채팅을 열지 않고 보내요"
            onPress={pick(onTouch)}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  icon,
  label,
  desc,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  desc?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={desc ? `${label} — ${desc}` : label}
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.textPrimary} style={styles.icon} />
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {desc ? <Text style={styles.desc}>{desc}</Text> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  header: { paddingHorizontal: spacing.xs, paddingBottom: spacing.sm },
  title: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  icon: { width: 20, alignItems: 'center' },
  rowText: { flex: 1 },
  label: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  desc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 1 },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
    marginHorizontal: spacing.xs,
  },
}));
