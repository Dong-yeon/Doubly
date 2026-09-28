/**
 * 문구 스티커 — 캐릭터 스티커 그림 아래쪽에 문구를 겹쳐 그린다. 말풍선과 "문구 넣기" 시트 미리보기가 같이 쓴다.
 *
 * <p><b>그림은 앱이 합성한다</b>. 서버는 문구와 스티커 코드만 들고 있고 이미지를 만들지도 올리지도 않는다 —
 * 원가 0 이고, 스티커 그림을 고치면 지난 메시지도 같이 바뀐다(content 가 코드가 아니라 문구라 가능하다).
 *
 * <p><b>아래 띠</b>: 달걀이·구운이 얼굴은 그림 위쪽 2/3 에 있다. 문구를 하단 약 25% 에 겹치면 얼굴을 가리지 않는다.
 *
 * <p><b>흰 외곽선</b>: RN 의 textShadow 는 한 방향 하나뿐이라 외곽선이 안 된다. 같은 글을 흰색으로
 * 네 방향으로 한 칸씩 밀어 깔고 그 위에 진한 글을 얹는다. 스티커는 라이트/다크 모두 흰 배경 그림이라
 * 글자색을 테마에 맞출 필요 없이 고정한다.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { stickerImageOf } from '../../constants/stickerImages';
import { fonts } from '../../theme/fonts';
import { textStickerLength } from '../../utils/textSticker';

interface Props {
  stickerCode: string | null | undefined;
  text: string;
  size?: number;
}

/** 문구가 길수록 작게 — 두 줄 안에 들어가게 한다(18 → 13) */
function fontSizeFor(text: string, size: number): number {
  const n = textStickerLength(text);
  const base = n <= 4 ? 18 : n <= 6 ? 16 : n <= 9 ? 14 : 13;
  return Math.round((base * size) / 132);
}

const OUTLINE = 1.5;
// left·right 를 함께 줘서 폭을 본문과 같게 고정한다 — 한쪽만 주면 절대 배치 글이 다르게 줄바꿈된다
const OFFSETS = [
  { left: -OUTLINE, right: OUTLINE, top: 0 },
  { left: OUTLINE, right: -OUTLINE, top: 0 },
  { left: 0, right: 0, top: -OUTLINE },
  { left: 0, right: 0, top: OUTLINE },
];

export function TextSticker({ stickerCode, text, size = 132 }: Props) {
  const def = stickerImageOf(stickerCode);
  const fontSize = fontSizeFor(text, size);
  const lineHeight = Math.round(fontSize * 1.2);
  const textStyle = [styles.text, { fontSize, lineHeight }];

  return (
    <View style={{ width: size, height: size }} accessible accessibilityLabel={`${def?.label ?? ''} 스티커: ${text}`}>
      {def ? (
        <Image source={def.source} style={{ width: size, height: size }} resizeMode="contain" />
      ) : null}
      {/* 하단 약 25% — 두 줄이면 위로 조금 더 올라온다(bottom 기준이라 얼굴 쪽으로 자란다) */}
      <View style={[styles.band, { bottom: size * 0.04, paddingHorizontal: size * 0.04 }]} pointerEvents="none">
        <View>
          {OFFSETS.map((o, i) => (
            <Text key={i} style={[textStyle, styles.outline, o]} numberOfLines={2}>
              {text}
            </Text>
          ))}
          <Text style={textStyle} numberOfLines={2}>
            {text}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  text: { fontFamily: fonts.semiBold, color: '#2B2330', textAlign: 'center' },
  outline: { position: 'absolute', color: '#FFFFFF' },
});
