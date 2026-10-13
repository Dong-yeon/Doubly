/**
 * 오목 판 — 실전(OmokScreen)과 연습(OmokPracticeScreen)이 같이 쓴다. 실전 화면의 renderBoard 를 그대로 떼어 냈다.
 *
 * <p>순수 View 로 그린다 — 교차점마다 Pressable 하나. 돌 색은 내 돌/상대 돌이 아니라 흑/백으로 그린다(오목의 관행이고
 * 둘의 화면이 같아 보여야 대화가 된다).
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { radius } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

const SIZE = 15;
const CELLS = SIZE * SIZE;
/** 화점(별) — 판의 기준점. 15줄 판의 관행 위치 */
const STAR_POINTS = new Set([3 * SIZE + 3, 3 * SIZE + 11, 7 * SIZE + 7, 11 * SIZE + 3, 11 * SIZE + 11]);

export interface OmokBoardProps {
  /** 225자 — 'M' 내 돌 · 'P' 상대 돌 · '0' 빈 자리 */
  stones: string;
  myIsBlack: boolean;
  /** 판 한 변(px) */
  size: number;
  interactive: boolean;
  onPress: (index: number) => void;
  winningLine?: readonly number[] | null;
  lastMove?: number | null;
  /** 둔 순서 — 최근 세 수에 옅은 테두리를 남긴다 */
  moves?: readonly number[];
  /** 코치가 가리키는 교차점(튜토리얼) */
  coachCells?: readonly number[] | null;
}

export function OmokBoard({ stones, myIsBlack, size, interactive, onPress, winningLine, lastMove, moves, coachCells }: OmokBoardProps) {
  const cell = size / SIZE;
  const stoneSize = Math.max(12, cell * 0.78);
  const winning = new Set(winningLine ?? []);
  const coach = new Set(coachCells ?? []);
  /*
   * 최근 세 수에 옅은 테두리를 남긴다 — 며칠 만에 들어왔을 때 "어디까지 뒀더라"가
   * 마지막 점 하나로는 안 읽힌다. 가장 최근 수는 이미 점이 있으므로 2·3번째만 그린다.
   */
  const recentRank = new Map<number, number>();
  (moves ?? []).slice(-3).forEach((idx, i, arr) => recentRank.set(idx, arr.length - 1 - i));
  const ringSize = Math.min(cell, stoneSize + 4);
  return (
    <View style={[styles.board, { width: size, height: size }]}>
      {Array.from({ length: CELLS }, (_, index) => {
        const row = Math.floor(index / SIZE);
        const col = index % SIZE;
        const s = stones[index];
        const isBlack = s === 'M' ? myIsBlack : s === 'P' ? !myIsBlack : false;
        const half = cell / 2;
        return (
          <Pressable
            key={index}
            disabled={!interactive}
            onPress={() => onPress(index)}
            accessibilityRole="button"
            accessibilityLabel={`${row + 1}행 ${col + 1}열 ${s === '0' ? '빈 자리' : isBlack ? '흑돌' : '백돌'}`}
            style={{ width: cell, height: cell }}
          >
            {/* 격자선 — 가장자리는 판 중앙 쪽 절반만 그려 교차점이 선 끝에 오게 한다 */}
            <View
              style={[
                styles.lineH,
                { top: half - 0.5, left: col === 0 ? half : 0, right: col === SIZE - 1 ? half : 0 },
              ]}
            />
            <View
              style={[
                styles.lineV,
                { left: half - 0.5, top: row === 0 ? half : 0, bottom: row === SIZE - 1 ? half : 0 },
              ]}
            />
            {STAR_POINTS.has(index) && s === '0' ? (
              <View style={[styles.star, { left: half - 2.5, top: half - 2.5 }]} />
            ) : null}
            {coach.has(index) ? (
              <View
                style={[
                  styles.coachRing,
                  { width: ringSize, height: ringSize, borderRadius: ringSize / 2, left: half - ringSize / 2, top: half - ringSize / 2 },
                ]}
              />
            ) : null}
            {recentRank.get(index) ? (
              <View
                style={[
                  styles.recentRing,
                  {
                    width: ringSize,
                    height: ringSize,
                    borderRadius: ringSize / 2,
                    left: half - ringSize / 2,
                    top: half - ringSize / 2,
                    opacity: recentRank.get(index) === 1 ? 0.5 : 0.25,
                  },
                ]}
              />
            ) : null}
            {s !== '0' ? (
              <View
                style={[
                  styles.stone,
                  isBlack ? styles.stoneBlack : styles.stoneWhite,
                  winning.has(index) && styles.stoneWinning,
                  {
                    width: stoneSize,
                    height: stoneSize,
                    borderRadius: stoneSize / 2,
                    left: half - stoneSize / 2,
                    top: half - stoneSize / 2,
                  },
                ]}
              >
                {lastMove === index ? (
                  <View style={[styles.lastDot, isBlack ? styles.lastDotOnBlack : styles.lastDotOnWhite]} />
                ) : null}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  board: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    // 나무색 판 — 일러스트 고유값이라 테마 토큰을 쓰지 않는다(다크에서도 같은 판이어야 돌 색이 읽힌다)
    backgroundColor: '#E8C48A',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  lineH: { position: 'absolute', height: 1, backgroundColor: '#8B6A3A' },
  lineV: { position: 'absolute', width: 1, backgroundColor: '#8B6A3A' },
  star: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#8B6A3A' },
  stone: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  stoneBlack: { backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#000000' },
  stoneWhite: { backgroundColor: '#F7F5EF', borderWidth: 1, borderColor: '#9A9A9A' },
  stoneWinning: { borderWidth: 2, borderColor: colors.primary },
  lastDot: { width: 5, height: 5, borderRadius: 2.5 },
  lastDotOnBlack: { backgroundColor: '#F7F5EF' },
  lastDotOnWhite: { backgroundColor: '#1E1E1E' },
  /* 최근 세 수 표시 — 가장 최근 수는 점이 있으므로 2·3번째만 옅은 테두리로 남긴다 */
  recentRing: { position: 'absolute', borderWidth: 2, borderColor: colors.primary },
  /* 코치가 짚는 자리 — 나무판 위에서도 보이게 진한 초록 굵은 고리 */
  coachRing: { position: 'absolute', borderWidth: 3, borderColor: '#1E8652' },
}));

/** 흑/백 판(0·1·2)을 보는 사람 기준 'M'/'P'/'0' 문자열로 — 연습 판이 실전 그리기를 그대로 쓰도록 */
export function toStones(board: readonly number[], myColor: number): string {
  return board.map((v) => (v === 0 ? '0' : v === myColor ? 'M' : 'P')).join('');
}
