/** 카카오맵 (네이티브) — WebView 로 렌더링. 웹 구현은 KakaoMap.web.tsx */
import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildKakaoMapHtml, parseKakaoMapMessage } from '../utils/kakaoMapHtml';
import { colors, radius } from '../constants/theme';
import type { KakaoMapHandle, KakaoMapProps } from './KakaoMap.types';

export type { KakaoMapHandle, KakaoMapProps };

export const KakaoMap = forwardRef<KakaoMapHandle, KakaoMapProps>(function KakaoMap(
  { markers, selectable, centerLat, centerLng, height = 300, style, onSelect, onMarkerPress, onSearchResults },
  ref,
) {
  const webViewRef = useRef<WebView>(null);

  const html = useMemo(
    () => buildKakaoMapHtml({ markers, selectable, centerLat, centerLng }),
    // markers 내용이 바뀔 때만 재생성 (참조 변경마다 지도 리로드 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(markers), selectable, centerLat, centerLng],
  );

  useImperativeHandle(ref, () => ({
    search: (keyword: string) => {
      webViewRef.current?.injectJavaScript(
        `window.fittoSearch && window.fittoSearch(${JSON.stringify(keyword)}); true;`,
      );
    },
    setPin: (lat: number, lng: number) => {
      webViewRef.current?.injectJavaScript(
        `window.fittoSetPin && window.fittoSetPin(${lat}, ${lng}); true;`,
      );
    },
  }));

  return (
    <View style={[styles.container, { height }, style]}>
      <WebView
        ref={webViewRef}
        // 카카오 JS 키는 도메인 검증을 하므로 콘솔에 등록한 localhost:8081 을 페이지 origin 으로 사용
        source={{ html, baseUrl: 'http://localhost:8081' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={(e) => {
          const msg = parseKakaoMapMessage(e.nativeEvent.data);
          if (!msg) return;
          if (msg.type === 'select') onSelect?.({ lat: msg.lat, lng: msg.lng, address: msg.address });
          if (msg.type === 'marker') onMarkerPress?.(msg.id);
          if (msg.type === 'search-results') onSearchResults?.(msg.keyword, msg.results);
        }}
      />
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
