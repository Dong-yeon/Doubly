/** 카카오맵 (네이티브) — WebView 로 렌더링. 웹 구현은 KakaoMap.web.tsx */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildKakaoMapHtml, parseKakaoMapMessage } from '../utils/kakaoMapHtml';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import type { KakaoMapHandle, KakaoMapProps } from './KakaoMap.types';
import { themedStyles } from '../theme/themedStyles';

export type { KakaoMapHandle, KakaoMapProps };

export const KakaoMap = forwardRef<KakaoMapHandle, KakaoMapProps>(function KakaoMap(
  { markers, path, selectable, centerLat, centerLng, height = 300, style, onSelect, onMarkerPress, onSearchResults },
  ref,
) {
  const webViewRef = useRef<WebView>(null);
  const [failed, setFailed] = useState(false);

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
      {/* 로드 실패는 대개 도메인 미등록이다 — 회색 빈 지도 대신 원인을 알려준다 (KakaoMap.web.tsx 와 동일 문구) */}
      {failed ? (
        <View style={styles.failed}>
          <Text style={styles.failedText}>
            지도를 불러오지 못했어요.{'\n'}
            카카오 개발자 콘솔의 JavaScript 키와{'\n'}
            SDK 도메인 등록을 확인해주세요.
          </Text>
        </View>
      ) : null}
      <WebView
        ref={webViewRef}
        /*
         * 카카오 JS 키는 도메인 검증을 하므로 콘솔에 등록해둔 도메인을 페이지 origin 으로
         * 써야 한다. localhost:8081 은 Metro 개발 서버용으로 등록해둔 값이라 개발 중(dev
         * client)에는 통과하지만, 실제 배포 빌드(TestFlight 등)에는 Metro 가 없으니 그
         * 도메인이 유효할 이유가 없다 — 안드로이드는 WebView 가 이 baseUrl 검증에 관대해
         * 우연히 넘어갔을 뿐, iOS(WKWebView)는 엄격해서 지도가 아예 안 뜨는 것으로 처음
         * 드러났다(실기기 리포트, 2026-09-01). 배포 빌드는 카카오 콘솔에 별도로 등록해둔
         * 실제 도메인(dubly.co.kr)을 쓴다 — 개발 중엔 계속 localhost:8081 을 쓴다.
         */
        source={{ html: initialHtml, baseUrl: __DEV__ ? 'http://localhost:8081' : 'https://dubly.co.kr' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onError={(e) => {
          console.warn('[KakaoMap] WebView onError:', e.nativeEvent);
          setFailed(true);
        }}
        onHttpError={(e) => {
          console.warn('[KakaoMap] WebView onHttpError:', e.nativeEvent);
          setFailed(true);
        }}
        onMessage={(e) => {
          const msg = parseKakaoMapMessage(e.nativeEvent.data);
          if (!msg) return;
          if (msg.type === 'select') onSelect?.({ lat: msg.lat, lng: msg.lng, address: msg.address });
          if (msg.type === 'marker') onMarkerPress?.(msg.id);
          if (msg.type === 'search-results') onSearchResults?.(msg.keyword, msg.results);
          if (msg.type === 'failed') {
            // WebView 내부 JS 콘솔은 RN 쪽 Metro 로그에 안 잡힌다 — 원인 문자열을 여기서 다시 찍어준다.
            console.warn('[KakaoMap] 지도 로드 실패:', msg.reason ?? '(원인 미상)');
            setFailed(true);
          }
        }}
      />
    </View>
  );
});

const styles = themedStyles((colors) => ({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  failed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 1,
  },
  failedText: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    textAlign: 'center',
    lineHeight: 20,
  },
}));
