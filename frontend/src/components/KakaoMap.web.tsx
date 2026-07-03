/** 카카오맵 (웹) — iframe(srcDoc) 렌더링. 네이티브 구현은 KakaoMap.tsx */
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { buildKakaoMapHtml, parseKakaoMapMessage } from '../utils/kakaoMapHtml';
import { colors, radius } from '../constants/theme';
import type { KakaoMapProps } from './KakaoMap.types';

export type { KakaoMapProps };

export function KakaoMap({
  markers,
  selectable,
  centerLat,
  centerLng,
  height = 300,
  style,
  onSelect,
  onMarkerPress,
}: KakaoMapProps) {
  const html = useMemo(
    () => buildKakaoMapHtml({ markers, selectable, centerLat, centerLng }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(markers), selectable, centerLat, centerLng],
  );

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = parseKakaoMapMessage(e.data);
      if (!msg) return;
      if (msg.type === 'select') onSelect?.({ lat: msg.lat, lng: msg.lng, address: msg.address });
      if (msg.type === 'marker') onMarkerPress?.(msg.id);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSelect, onMarkerPress]);

  return (
    <View style={[styles.container, { height }, style]}>
      {React.createElement('iframe', {
        srcDoc: html,
        title: 'kakao-map',
        style: { border: 0, width: '100%', height: '100%' },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
});
