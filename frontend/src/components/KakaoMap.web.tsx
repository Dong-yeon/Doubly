/**
 * 카카오맵 (웹) — SDK 를 <b>메인 문서에 직접</b> 로드한다. 네이티브 구현은 KakaoMap.tsx
 *
 * 예전에는 네이티브와 같은 HTML 을 `<iframe srcDoc>` 로 띄웠는데, srcdoc 문서는
 * `location.href` 가 `about:srcdoc` 이라 <b>카카오 SDK 의 도메인 검사를 통과하지 못했다</b>
 * — 콘솔에 localhost:8081 을 등록해도 인식되지 않아 지도가 빈 화면이었다.
 * 메인 문서에서 로드하면 실제 페이지 도메인이 그대로 쓰여 정상 동작한다.
 * (네이티브는 WebView 가 `baseUrl` 을 지정하므로 기존 HTML 방식을 유지한다)
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KAKAO_JS_KEY } from '../constants/config';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import type { KakaoMapHandle, KakaoMapProps } from './KakaoMap.types';
import { themedStyles } from '../theme/themedStyles';

export type { KakaoMapHandle, KakaoMapProps };

// SDK 는 페이지당 한 번만 — 지도 컴포넌트가 여럿 떠도 스크립트는 하나다
let sdkPromise: Promise<void> | null = null;

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = (window as any).kakao;
    if (existing?.maps) {
      existing.maps.load(() => resolve());
      return;
    }
    const script = document.createElement('script');
    script.src =
      `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false`;
    script.async = true;
    script.onload = () => (window as any).kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error('카카오맵 SDK 로드 실패'));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

// 기본 중심: 서울 시청
const DEFAULT_LAT = 37.5665;
const DEFAULT_LNG = 126.978;

// 색상 지정 핀 — 원형 SVG 를 데이터 URI 로 인라인 렌더링 (kakaoMapHtml.ts 의 네이티브 버전과 동일 규칙)
function pinImage(kakao: any, color: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">` +
    `<circle cx="14" cy="14" r="10" fill="${color}" stroke="#ffffff" stroke-width="3"/></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new kakao.maps.MarkerImage(url, new kakao.maps.Size(28, 28), {
    offset: new kakao.maps.Point(14, 14),
  });
}

export const KakaoMap = forwardRef<KakaoMapHandle, KakaoMapProps>(function KakaoMap(
  { markers, path, selectable, centerLat, centerLng, height = 300, style, onSelect, onMarkerPress, onSearchResults },
  ref,
) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const selMarkerRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  /** 화면 맞추기를 이미 했는지 — 갱신마다 시야를 다시 잡지 않기 위해 */
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // 콜백은 ref 로 잡는다 — 매 렌더마다 지도를 다시 만들지 않기 위해
  const cbRef = useRef({ onSelect, onMarkerPress, onSearchResults });
  cbRef.current = { onSelect, onMarkerPress, onSearchResults };

  // 1) 지도 생성 (한 번)
  useEffect(() => {
    let disposed = false;
    loadSdk()
      .then(() => {
        if (disposed || !boxRef.current || mapRef.current) return;
        const kakao = (window as any).kakao;
        mapRef.current = new kakao.maps.Map(boxRef.current, {
          center: new kakao.maps.LatLng(centerLat ?? DEFAULT_LAT, centerLng ?? DEFAULT_LNG),
          level: 5,
        });
        setReady(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) 마커·동선 — 이전 오버레이를 지우고 다시 그린다
  useEffect(() => {
    const kakao = (window as any).kakao;
    const map = mapRef.current;
    if (!ready || !kakao?.maps || !map) return;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const bounds = new kakao.maps.LatLngBounds();
    (markers ?? []).forEach((m) => {
      const pos = new kakao.maps.LatLng(m.lat, m.lng);
      bounds.extend(pos);
      const markerOpts: any = { map, position: pos, title: m.title };
      if (m.color) markerOpts.image = pinImage(kakao, m.color);
      const marker = new kakao.maps.Marker(markerOpts);
      kakao.maps.event.addListener(marker, 'click', () => cbRef.current.onMarkerPress?.(m.id));
      const label = new kakao.maps.CustomOverlay({
        map,
        position: pos,
        yAnchor: 0,
        content:
          '<div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:2px 8px;' +
          'font-size:11px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.15);white-space:nowrap;">' +
          m.title.replace(/</g, '&lt;') +
          '</div>',
      });
      overlaysRef.current.push(marker, label);
    });

    if (path && path.length > 1) {
      const line = new kakao.maps.Polyline({
        map,
        path: path.map((p) => new kakao.maps.LatLng(p.lat, p.lng)),
        strokeWeight: 4,
        strokeColor: '#4A5BFF',
        strokeOpacity: 0.85,
        strokeStyle: 'solid',
      });
      overlaysRef.current.push(line);
      path.forEach((p) => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));
    }

    /*
     * 화면 맞추기는 <b>처음 그릴 때만</b> 한다.
     * 갱신마다 setBounds 를 부르면(여행 상세의 Day 전환 등) 사용자가 확대·이동해둔
     * 시야를 매번 빼앗는다. 이후에는 마커만 바꾸고 시야는 그대로 둔다.
     */
    if (fittedRef.current) return;
    fittedRef.current = true;
    if ((markers?.length ?? 0) > 1 || (path?.length ?? 0) > 1) {
      map.setBounds(bounds, 40, 40, 40, 40);
    } else if (markers?.length === 1) {
      map.setCenter(new kakao.maps.LatLng(markers[0].lat, markers[0].lng));
    }
  }, [ready, markers, path]);

  // 3) 탭으로 좌표 선택 (주소 자동 조회)
  useEffect(() => {
    const kakao = (window as any).kakao;
    const map = mapRef.current;
    if (!ready || !selectable || !kakao?.maps || !map) return;

    const geocoder = new kakao.maps.services.Geocoder();
    const handler = (e: any) => {
      const pos = e.latLng;
      if (selMarkerRef.current) selMarkerRef.current.setPosition(pos);
      else selMarkerRef.current = new kakao.maps.Marker({ map, position: pos });
      geocoder.coord2Address(pos.getLng(), pos.getLat(), (res: any[], status: string) => {
        let addr: string | null = null;
        if (status === kakao.maps.services.Status.OK && res[0]) {
          addr = res[0].road_address?.address_name ?? res[0].address?.address_name ?? null;
        }
        cbRef.current.onSelect?.({ lat: pos.getLat(), lng: pos.getLng(), address: addr });
      });
    };
    kakao.maps.event.addListener(map, 'click', handler);
    return () => kakao.maps.event.removeListener(map, 'click', handler);
  }, [ready, selectable]);

  useImperativeHandle(ref, () => ({
    search: (keyword: string) => {
      const kakao = (window as any).kakao;
      if (!kakao?.maps || !keyword) return;
      new kakao.maps.services.Places().keywordSearch(keyword, (res: any[], status: string) => {
        const results =
          status === kakao.maps.services.Status.OK
            ? res.slice(0, 10).map((p) => ({
                name: p.place_name,
                address: p.road_address_name || p.address_name || null,
                categoryGroup: p.category_group_code || null,
                lat: parseFloat(p.y),
                lng: parseFloat(p.x),
              }))
            : [];
        cbRef.current.onSearchResults?.(keyword, results);
      });
    },
    setPin: (lat: number, lng: number) => {
      const kakao = (window as any).kakao;
      const map = mapRef.current;
      if (!kakao?.maps || !map) return;
      const pos = new kakao.maps.LatLng(lat, lng);
      if (selMarkerRef.current) selMarkerRef.current.setPosition(pos);
      else selMarkerRef.current = new kakao.maps.Marker({ map, position: pos });
      map.setCenter(pos);
      if (map.getLevel() > 4) map.setLevel(4);
    },
  }));

  return (
    <View style={[styles.container, { height }, style]}>
      {/* 로드 실패는 대개 도메인 미등록이다 — 빈 화면 대신 원인을 알려준다 */}
      {failed ? (
        <View style={styles.failed}>
          <Text style={styles.failedText}>
            지도를 불러오지 못했어요.{'\n'}
            카카오 개발자 콘솔의 JavaScript 키와{'\n'}
            SDK 도메인 등록을 확인해주세요.
          </Text>
        </View>
      ) : null}
      {React.createElement('div', {
        ref: boxRef,
        style: { width: '100%', height: '100%' },
      })}
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
