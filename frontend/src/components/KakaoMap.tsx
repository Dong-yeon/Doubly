/** 카카오맵 (네이티브) — WebView 로 렌더링. 웹 구현은 KakaoMap.web.tsx */
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildKakaoMapHtml, parseKakaoMapMessage } from '../utils/kakaoMapHtml';
import { colors, radius } from '../constants/theme';
import type { KakaoMapHandle, KakaoMapProps } from './KakaoMap.types';

export type { KakaoMapHandle, KakaoMapProps };

export const KakaoMap = forwardRef<KakaoMapHandle, KakaoMapProps>(function KakaoMap(
  { markers, path, selectable, centerLat, centerLng, height = 300, style, onSelect, onMarkerPress, onSearchResults },
  ref,
) {
  const webViewRef = useRef<WebView>(null);

  /*
   * HTML 은 <b>처음 한 번만</b> 만든다.
   *
   * 예전에는 markers/path 를 deps 에 넣어 목록이 바뀔 때마다 HTML 이 새로 생성됐고,
   * source 가 교체되면서 WebView 가 통째로 리로드됐다 — 카카오 SDK 재다운로드에
   * 사용자가 맞춰둔 확대·중심 초기화까지 따라왔다.
   * 이후 변경은 아래 effect 에서 injectJavaScript 로 마커만 다시 그린다.
   */
  const initialHtml = useRef(
    buildKakaoMapHtml({ markers, path, selectable, centerLat, centerLng }),
  ).current;

  const markersKey = JSON.stringify(markers);
  const pathKey = JSON.stringify(path);
  const firstRender = useRef(true);
  useEffect(() => {
    // 최초 그리기는 HTML 안에서 이미 끝났다 — 두 번 그리지 않는다
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    webViewRef.current?.injectJavaScript(
      `window.fittoSetMarkers && window.fittoSetMarkers(${markersKey}, ${pathKey}, false); true;`,
    );
  }, [markersKey, pathKey]);

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
        source={{ html: initialHtml, baseUrl: 'http://localhost:8081' }}
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
