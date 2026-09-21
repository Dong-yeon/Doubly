/**
 * 길막기 — 9×9 판에서 말을 반대편 끝줄까지 먼저 보내면 이긴다.
 * docs/PATH_LOCK_ANALYSIS_2026-09-21.md.
 *
 * <p>매 턴 <b>한 칸 이동</b> 또는 <b>벽 하나</b> 중 하나를 고른다. 벽은 길을 돌게 만들 수는
 * 있어도 막을 수는 없다 — 그 판정(BFS)은 서버에만 있다(§4-2 2번). 그래서 이 화면은 놓을 수
 * 없는 벽을 미리 흐리게 만들지 않고 <b>거절 메시지를 토스트로</b> 띄운다. 대신 말이 갈 수 있는
 * 자리는 서버가 {@code legalMoves} 로 내려주므로 점으로 찍는다.
 *
 * <p>벽은 칸이 아니라 <b>칸 사이</b>에 놓이고 한 번 놓으면 되돌릴 수 없는 자원이라, 탭 한 번에
 * 바로 놓지 않는다 — 교차점을 누르면 미리보기가 뜨고 한 번 더 눌러야 확정된다.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { useContentWidth } from '../../hooks/useContentWidth';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { GameReactionBar } from '../../components/GameReactionBar';
import { MaterialCommunityIcons } from '../../components/Icon';
import { wallRaceApi } from '../../api/game';
import { connectSocket, subscribeCouple, unsubscribeCouple } from '../../api/chatSocket';
import { useRelationStore } from '../../store/relationStore';
import { getErrorMessage } from '../../utils/error';
import { relativeTimestampLabel } from '../../utils/date';
import { Alert } from '../../utils/alert';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { fontSize, radius, spacing } from '../../constants/theme';
import type { WallRaceGame } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'WallRace'>;

const SIZE = 9;
const WALL_SIZE = SIZE - 1;

/** 판 색 — 오목과 같은 이유로 테마 토큰을 쓰지 않는다(다크에서도 같은 판이어야 말이 읽힌다) */
const BOARD_BG = '#E9E3D6';
const CELL_BG = '#FBF8F1';
const GROOVE = '#D6CDB9';
const WALL_COLOR = '#7A5C3A';
const PAWN_ME = '#2F6FEB';
const PAWN_PARTNER = '#E5484D';

/** 수 요청 순번 — 옛 응답이 새 상태를 덮지 않도록(OmokScreen.placeSeq 와 같은 이유) */
let moveSeq = 0;

type Pending = { slot: number; kind: 'H' | 'V' };

export function WallRaceScreen(_: Props) {
  const width = useContentWidth();
  const relationId = useRelationStore((s) => s.couple?.id);

  const [game, setGame] = useState<WallRaceGame | null>(null);
  /** 방금 끝난 판 — current 가 null 이 된 뒤에도 결과를 보여주기 위해 따로 든다 */
  const [justFinished, setJustFinished] = useState<WallRaceGame | null>(null);
  const [history, setHistory] = useState<WallRaceGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 벽 모드에서 고른 자리 — 확정 전이라 아직 서버에 가지 않았다 */
  const [pending, setPending] = useState<Pending | null>(null);
  const [wallMode, setWallMode] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const [g, h] = await Promise.all([wallRaceApi.current(), wallRaceApi.history()]);
      setGame(g);
      setHistory(h);
      // 내 차례가 아니게 됐으면 고르던 벽은 의미가 없다 — 모드째 내린다
      if (!g?.myTurn) {
        setPending(null);
        setWallMode(false);
      }
      // 상대가 이겨서 끝났으면 current 가 null 이 된다 — 최신 기록을 결과 화면으로 올린다
      if (!g && h.length > 0) {
        setJustFinished((prev) => (prev && prev.id === h[0].id ? prev : h[0]));
      }
      if (g) setJustFinished(null);
    } catch (e) {
      if (!silent) toast.error(getErrorMessage(e, '판을 불러오지 못했어요.'));
      setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useFocusEffect(
    useCallback(() => {
      if (!relationId) return undefined;
      let active = true;
      connectSocket()
        .then(() => {
          if (!active) return;
          subscribeCouple(relationId, (type) => {
            if (type === 'GAME') void load(true);
          });
        })
        .catch(() => undefined);
      return () => {
        active = false;
        unsubscribeCouple(relationId);
      };
    }, [relationId, load]),
  );

  const start = async () => {
    setStarting(true);
    try {
      const g = await wallRaceApi.start();
      setGame(g);
      setJustFinished(null);
      setPending(null);
      setWallMode(false);
      haptics.light();
      if (!g.myTurn) toast.success(`${g.partnerName ?? '상대'}에게 선공을 줬어요. 두면 알려드릴게요.`);
    } catch (e) {
      toast.error(getErrorMessage(e, '새 판을 열지 못했어요.'));
    } finally {
      setStarting(false);
    }
  };

  /** 수를 둔 뒤 공통 — 끝났으면 결과 화면으로 넘긴다 */
  const applyResult = (updated: WallRaceGame) => {
    setPending(null);
    if (updated.status === 'COMPLETED') {
      setJustFinished(updated);
      setGame(null);
      setWallMode(false);
      if (updated.winner === 'ME') haptics.success();
      wallRaceApi.history().then(setHistory).catch(() => undefined);
    } else {
      setGame(updated);
    }
  };

  const movePawn = async (target: number) => {
    if (!game || busy || !game.myTurn) return;
    haptics.light();
    setBusy(true);
    const seq = ++moveSeq;
    try {
      const updated = await wallRaceApi.movePawn(game.id, target);
      if (seq !== moveSeq) return;
      applyResult(updated);
    } catch (e) {
      if (seq !== moveSeq) return;
      toast.error(getErrorMessage(e, '말을 옮기지 못했어요.'));
      void load(true);
    } finally {
      if (seq === moveSeq) setBusy(false);
    }
  };

  const confirmWall = async () => {
    if (!game || !pending || busy) return;
    haptics.light();
    setBusy(true);
    const seq = ++moveSeq;
    try {
      const updated = await wallRaceApi.placeWall(game.id, pending.slot, pending.kind);
      if (seq !== moveSeq) return;
      setWallMode(false);
      applyResult(updated);
    } catch (e) {
      if (seq !== moveSeq) return;
      // 서버 메시지가 곧 설명이다 — "길을 완전히 막을 수는 없어요" 같은 문장이 그대로 온다
      toast.error(getErrorMessage(e, '벽을 놓지 못했어요.'));
      void load(true);
    } finally {
      if (seq === moveSeq) setBusy(false);
    }
  };

  const confirmGiveUp = () => {
    if (!game) return;
    Alert.alert('이 판을 접을까요?', '접은 판은 전적에 남지 않고, 상대 화면에서도 사라져요.', [
      { text: '계속 두기', style: 'cancel' },
      {
        text: '접기',
        style: 'destructive',
        onPress: () => {
          wallRaceApi
            .giveUp(game.id)
            .then(() => { setGame(null); setPending(null); toast.success('이 판은 접었어요.'); })
            .catch((e) => toast.error(getErrorMessage(e, '접지 못했어요.')));
        },
      },
    ]);
  };

  // ── 판 기하 ────────────────────────────────────────────────────────
  /*
   * 벽이 칸 사이에 놓이므로 칸 사이에 홈(groove)을 둔다. 홈이 곧 벽의 두께이자 탭 영역의
   * 중심이다. 칸 9개 + 홈 8개 + 양쪽 여백이 판 한 변이다.
   */
  const boardSize = Math.min(width - spacing.lg * 2, 380);
  const pad = 4;
  const grooveRatio = 0.24;
  const cell = (boardSize - pad * 2) / (SIZE + WALL_SIZE * grooveRatio);
  const gap = cell * grooveRatio;
  const pitch = cell + gap;
  const cellX = (col: number) => pad + col * pitch;
  const cellY = (row: number) => pad + row * pitch;
  /** 교차점 (r,c) 의 홈 중심 */
  const jointX = (c: number) => pad + (c + 1) * pitch - gap / 2;
  const jointY = (r: number) => pad + (r + 1) * pitch - gap / 2;

  const record = useMemo(
    () => ({
      me: history.filter((g) => g.winner === 'ME').length,
      partner: history.filter((g) => g.winner === 'PARTNER').length,
    }),
    [history],
  );

  const renderBoard = (g: WallRaceGame, interactive: boolean) => {
    const legal = new Set(interactive && !wallMode ? g.legalMoves : []);
    const pawnSize = cell * 0.62;
    const dotSize = cell * 0.3;
    /*
     * 교차점 탭 영역은 서로 닿을 만큼 크게 잡는다 — 벽은 칸이 아니라 칸 사이에 놓여서
     * 홈(gap)만큼만 주면 손가락으로 집을 수가 없다(분석 §4-2 4번이 지목한 자리).
     * 한 변을 pitch 로 두면 빈틈도 겹침도 없이 8×8 을 덮는다.
     */
    const jointHit = pitch;

    return (
      <View style={[styles.board, { width: boardSize, height: boardSize }]}>
        {/* 칸 — 목표 줄은 옅게 칠해 "어디로 가야 하는지"가 판에서 바로 읽히게 한다 */}
        {Array.from({ length: SIZE * SIZE }, (_, index) => {
          const row = Math.floor(index / SIZE);
          const col = index % SIZE;
          const isMyGoal = row === g.myGoalRow;
          const isPartnerGoal = row === (g.myGoalRow === 0 ? SIZE - 1 : 0);
          return (
            <View
              key={`c${index}`}
              style={[
                styles.cell,
                { left: cellX(col), top: cellY(row), width: cell, height: cell },
                isMyGoal && { backgroundColor: '#DCE8FF' },
                isPartnerGoal && { backgroundColor: '#FFE1E2' },
              ]}
            />
          );
        })}

        {/* 갈 수 있는 자리 — 서버가 계산해 내려준 것만 찍는다 */}
        {[...legal].map((index) => {
          const row = Math.floor(index / SIZE);
          const col = index % SIZE;
          return (
            <Pressable
              key={`m${index}`}
              onPress={() => movePawn(index)}
              accessibilityRole="button"
              accessibilityLabel={`${row + 1}행 ${col + 1}열로 이동`}
              style={[styles.moveHit, { left: cellX(col), top: cellY(row), width: cell, height: cell }]}
            >
              <View
                style={[
                  styles.moveDot,
                  {
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    left: (cell - dotSize) / 2,
                    top: (cell - dotSize) / 2,
                  },
                ]}
              />
            </Pressable>
          );
        })}

        {/* 말 — 색은 내/상대로 나눈다(오목의 흑백과 달리 이 게임엔 관행 색이 없다) */}
        {([[g.myPawn, PAWN_ME, '내 말'], [g.partnerPawn, PAWN_PARTNER, '상대 말']] as const).map(
          ([pos, color, label]) => (
            <View
              key={label}
              accessible
              accessibilityLabel={`${label} ${Math.floor(pos / SIZE) + 1}행 ${(pos % SIZE) + 1}열`}
              style={[
                styles.pawn,
                {
                  backgroundColor: color,
                  width: pawnSize,
                  height: pawnSize,
                  borderRadius: pawnSize / 2,
                  left: cellX(pos % SIZE) + (cell - pawnSize) / 2,
                  top: cellY(Math.floor(pos / SIZE)) + (cell - pawnSize) / 2,
                },
              ]}
            />
          ),
        )}

        {/* 놓인 벽 */}
        {Array.from({ length: WALL_SIZE * WALL_SIZE }, (_, slot) => {
          const kind = g.walls[slot];
          if (kind !== 'H' && kind !== 'V') return null;
          return <View key={`w${slot}`} style={[styles.wall, wallRect(slot, kind)]} />;
        })}

        {/* 미리보기 — 아직 서버에 가지 않은 벽. 확정 버튼을 눌러야 놓인다 */}
        {pending ? (
          <View
            pointerEvents="none"
            style={[styles.wall, styles.wallPreview, wallRect(pending.slot, pending.kind)]}
          />
        ) : null}

        {/* 벽 모드일 때만 교차점 탭 영역을 깐다 — 평소엔 말 이동을 가리지 않게 없앤다 */}
        {interactive && wallMode
          ? Array.from({ length: WALL_SIZE * WALL_SIZE }, (_, slot) => {
              const r = Math.floor(slot / WALL_SIZE);
              const c = slot % WALL_SIZE;
              const chosen = pending?.slot === slot;
              return (
                <Pressable
                  key={`j${slot}`}
                  onPress={() =>
                    setPending((prev) =>
                      // 같은 자리를 다시 누르면 방향이 바뀐다 — 손가락 하나로 둘 다 고를 수 있게
                      prev && prev.slot === slot
                        ? { slot, kind: prev.kind === 'H' ? 'V' : 'H' }
                        : { slot, kind: 'H' },
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${r + 1}·${c + 1} 교차점에 벽 놓기`}
                  style={[
                    styles.joint,
                    {
                      left: jointX(c) - jointHit / 2,
                      top: jointY(r) - jointHit / 2,
                      width: jointHit,
                      height: jointHit,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.jointDot,
                      chosen && styles.jointDotOn,
                      { left: jointHit / 2 - 3, top: jointHit / 2 - 3 },
                    ]}
                  />
                </Pressable>
              );
            })
          : null}
      </View>
    );

    /** 벽 하나의 사각형 — 두 칸 길이로 홈을 덮는다 */
    function wallRect(slot: number, kind: 'H' | 'V') {
      const r = Math.floor(slot / WALL_SIZE);
      const c = slot % WALL_SIZE;
      const long = cell * 2 + gap;
      return kind === 'H'
        ? { left: cellX(c), top: jointY(r) - gap / 2, width: long, height: gap }
        : { left: jointX(c) - gap / 2, top: cellY(r), width: gap, height: long };
    }
  };

  const renderTurnBar = (g: WallRaceGame) => (
    <View style={styles.turnRow}>
      <View style={[styles.turnChip, g.myTurn && styles.turnChipActive]}>
        <View style={[styles.miniPawn, { backgroundColor: PAWN_ME }]} />
        <Text style={[styles.turnText, g.myTurn && styles.turnTextActive]}>나 · 벽 {g.myWallsLeft}</Text>
      </View>
      <Text style={styles.turnHint}>
        {g.myTurn ? '내 차례예요' : `${g.partnerName ?? '상대'} 차례예요`} · {g.moveCount}수
      </Text>
      <View style={[styles.turnChip, !g.myTurn && styles.turnChipActive]}>
        <View style={[styles.miniPawn, { backgroundColor: PAWN_PARTNER }]} />
        <Text style={[styles.turnText, !g.myTurn && styles.turnTextActive]} numberOfLines={1}>
          벽 {g.partnerWallsLeft}
        </Text>
      </View>
    </View>
  );

  /** 핸디캡 줄 — 접어준 것은 숨기지 않는다(연쇄 퍼즐과 같은 규칙) */
  const renderHandicap = (g: WallRaceGame) => {
    if (g.myWallsStart === g.partnerWallsStart) return null;
    const mine = g.myWallsStart > g.partnerWallsStart;
    return (
      <Text style={styles.handicap}>
        {mine
          ? `최근 판을 생각해서 벽을 ${g.myWallsStart - g.partnerWallsStart}개 더 받았어요.`
          : `${g.partnerName ?? '상대'}가 벽을 ${g.partnerWallsStart - g.myWallsStart}개 더 받았어요.`}
      </Text>
    );
  };

  const renderActionBar = (g: WallRaceGame) => {
    if (!g.myTurn) return <Text style={styles.hint}>상대가 두면 바로 보여요.</Text>;
    if (!wallMode) {
      return (
        <View style={styles.actionRow}>
          <Text style={styles.hint}>파란 점을 누르면 말이 움직여요.</Text>
          <Button
            title={g.myWallsLeft > 0 ? `벽 놓기 (${g.myWallsLeft})` : '벽 없음'}
            size="sm"
            variant="ghost"
            disabled={g.myWallsLeft <= 0 || busy}
            onPress={() => { setWallMode(true); setPending(null); }}
          />
        </View>
      );
    }
    return (
      <View style={styles.wallPanel}>
        <Text style={styles.hint}>
          {pending
            ? '같은 자리를 다시 누르면 가로·세로가 바뀌어요.'
            : '칸과 칸이 만나는 점을 누르면 벽이 미리 보여요.'}
        </Text>
        <View style={styles.actionRow}>
          <Button
            title="취소"
            size="sm"
            variant="ghost"
            onPress={() => { setWallMode(false); setPending(null); }}
            disabled={busy}
          />
          <Button
            title={pending ? (pending.kind === 'H' ? '가로로 놓기' : '세로로 놓기') : '자리를 고르세요'}
            size="sm"
            disabled={!pending || busy}
            loading={busy}
            onPress={confirmWall}
          />
        </View>
      </View>
    );
  };

  const renderResult = (g: WallRaceGame) => (
    <View style={[styles.card, styles.resultCard]}>
      <MaterialCommunityIcons name="trophy-outline" size={26} color="#7A5C3A" />
      <Text style={styles.resultTitle}>
        {g.winner === 'ME' ? '이겼어요!' : `${g.partnerName ?? '상대'}가 이겼어요`}
      </Text>
      <Text style={styles.cardDesc}>{g.moveCount}수 · 채팅에 결과 카드를 남겼어요.</Text>
      {renderBoard(g, false)}
    </View>
  );

  const renderStart = (title: string) => (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>길막기</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDesc}>
        내 말을 반대편 끝줄까지 먼저 보내면 이겨요. 한 턴에 한 칸 가거나 벽 하나를 놓을 수 있고,
        상대 길을 <Text style={styles.bold}>돌게</Text> 만들 수는 있어도 완전히 막을 수는 없어요.
        판을 열면 상대가 선공이에요.
      </Text>
      {record.me + record.partner > 0 ? (
        <Text style={styles.record}>전적 {record.me}승 {record.partner}패</Text>
      ) : null}
      <Button title="판 열기" onPress={start} loading={starting} style={styles.startBtn} />
    </View>
  );

  const header = (
    <View>
      {game ? (
        <View>
          {renderTurnBar(game)}
          {renderHandicap(game)}
          {renderBoard(game, game.myTurn && !busy)}
          {renderActionBar(game)}
          <GameReactionBar gameType="WALL_RACE" />
          <Button title="이 판 접기" variant="ghost" size="sm" onPress={confirmGiveUp} style={styles.giveUp} />
        </View>
      ) : justFinished ? (
        <>
          {renderResult(justFinished)}
          {renderStart('한 판 더?')}
        </>
      ) : !loading && !loadError ? (
        renderStart('한 판 둘까요?')
      ) : null}
      {history.length > 0 ? <Text style={styles.sectionTitle}>지난 판</Text> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={history}
        keyExtractor={(g) => String(g.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={() => load()}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={styles.histCard}>
            <View style={styles.histRow}>
              <Text style={styles.histDate}>
                {item.completedAt ? relativeTimestampLabel(item.completedAt) : ''}
              </Text>
              <Text style={[styles.histResult, item.winner === 'ME' && styles.histWin]}>
                {item.winner === 'ME' ? '승' : '패'}
              </Text>
            </View>
            <Text style={styles.histText}>
              {item.moveCount}수 · 남은 벽 나 {item.myWallsLeft} · 상대 {item.partnerWallsLeft}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          !loading && loadError && !game ? (
            <EmptyState
              error
              onRetry={() => load()}
              title="불러오지 못했어요"
              description="네트워크 상태를 확인하고 다시 시도해주세요."
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },

  card: {
    backgroundColor: colors.primaryBg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardLabel: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  cardTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
  cardDesc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 18 },
  bold: { fontWeight: '800', color: colors.textPrimary },
  record: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700', marginTop: spacing.sm },
  startBtn: { marginTop: spacing.md },
  resultCard: { alignItems: 'center', gap: spacing.xs },
  resultTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },

  turnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  turnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: '36%',
  },
  turnChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  turnText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary, flexShrink: 1 },
  turnTextActive: { color: colors.primary, fontWeight: '800' },
  turnHint: { flex: 1, textAlign: 'center', fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  miniPawn: { width: 12, height: 12, borderRadius: 6 },
  handicap: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  board: { alignSelf: 'center', backgroundColor: BOARD_BG, borderRadius: radius.md, overflow: 'hidden' },
  cell: { position: 'absolute', backgroundColor: CELL_BG, borderRadius: 3 },
  moveHit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  moveDot: { position: 'absolute', backgroundColor: PAWN_ME, opacity: 0.45 },
  pawn: { position: 'absolute', borderWidth: 2, borderColor: '#FFFFFF' },
  wall: { position: 'absolute', backgroundColor: WALL_COLOR, borderRadius: 2 },
  wallPreview: { opacity: 0.45 },
  joint: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  jointDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: GROOVE },
  jointDotOn: { backgroundColor: WALL_COLOR },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  wallPanel: { marginTop: spacing.md },
  hint: { flex: 1, fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  giveUp: { alignSelf: 'center', marginTop: spacing.xs },

  sectionTitle: {
    fontSize: fontSize.body,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  histCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  histRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  histDate: { fontSize: fontSize.caption, color: colors.textSecondary },
  histResult: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  histWin: { color: colors.primary },
  histText: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
}));
