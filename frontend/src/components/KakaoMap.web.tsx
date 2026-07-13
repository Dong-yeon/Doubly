/** 카카오맵 (웹) — iframe(srcDoc) 렌더링. 네이티브 구현은 KakaoMap.tsx */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { buildKakaoMapHtml, parseKakaoMapMessage } from '../utils/kakaoMapHtml';
import { colors, radius } from '../constants/theme';
import type { KakaoMapHandle, KakaoMapProps } from './KakaoMap.types';

export type { KakaoMapHandle, KakaoMapProps };

export const KakaoMap = forwardRef<KakaoMapHandle, KakaoMapProps>(function KakaoMap(
  { markers, selectable, centerLat, centerLng, height = 300, style, onSelect, onMarkerPress, onSearchResults },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const html = useMemo(
    () => buildKakaoMapHtml({ markers, selectable, centerLat, centerLng }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(markers), selectable, centerLat, centerLng],
  );

  const command = (payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ source: 'fitto-kakao-map-cmd', ...payload }),
      '*',
    );
  };

  useImperativeHandle(ref, () => ({
    search: (keyword: string) => command({ type: 'search', keyword }),
    setPin: (lat: number, lng: number) => command({ type: 'pin', lat, lng }),
  }));

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = parseKakaoMapMessage(e.data);
      if (!msg) return;
      if (msg.type === 'select') onSelect?.({ lat: msg.lat, lng: msg.lng, address: msg.address });
      if (msg.type === 'marker') onMarkerPress?.(msg.id);
      if (msg.type === 'search-results') onSearchResults?.(msg.keyword, msg.results);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSelect, onMarkerPress, onSearchResults]);

  return (
    <View style={[styles.container, { height }, style]}>
      {React.createElement('iframe', {
        ref: iframeRef,
        srcDoc: html,
        title: 'kakao-map',
        style: { border: 0, width: '100%', height: '100%' },
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
});
