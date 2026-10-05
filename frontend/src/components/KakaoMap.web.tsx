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
import { pinIconKey, type KakaoMapMarker } from '../utils/kakaoMapHtml';
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
// filled=false 면 속을 비우고 테두리만 색을 입힌다 — 색(예: 식단 구분)과는 별개 축(예: 방문 여부)을 표현할 때 쓴다
function pinImage(kakao: any, color: string, filled: boolean) {
  const circle = filled
    ? `<circle cx="14" cy="14" r="10" fill="${color}" stroke="#ffffff" stroke-width="3"/>`
    : `<circle cx="14" cy="14" r="10" fill="#ffffff" stroke="${color}" stroke-width="3"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">${circle}</svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new kakao.maps.MarkerImage(url, new kakao.maps.Size(28, 28), {
    offset: new kakao.maps.Point(14, 14),
  });
}

/**
 * 사진 핀 DOM — kakaoMapHtml.ts 의 photoPin(네이티브)과 <b>같은 모양</b>이어야 한다.
 * URL·글자는 innerHTML 로 잇지 않고 DOM 속성으로 넣는다(이름에 꺾쇠·따옴표가 있어도 안전).
 */
function photoPinElement(m: KakaoMapMarker, onPress: () => void): HTMLElement {
  const root = document.createElement('div');
  root.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;';
  const box = document.createElement('div');
  box.style.cssText =
    'width:52px;height:52px;border-radius:12px;border:3px solid #fff;overflow:hidden;' +
    'background:#eee;box-shadow:0 2px 6px rgba(0,0,0,.3);box-sizing:border-box;';
  const img = document.createElement('img');
  img.src = m.imageUrl ?? '';
  img.alt = '';
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
  box.appendChild(img);
  const tail = document.createElement('div');
  tail.style.cssText =
    'width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;' +
    'border-top:8px solid #fff;margin-top:-1px;filter:drop-shadow(0 2px 1px rgba(0,0,0,.2));';
  root.appendChild(box);
  root.appendChild(tail);
  if (m.count && m.count > 1) {
    const badge = document.createElement('div');
    badge.textContent = m.count > 99 ? '99+' : String(m.count);
    badge.style.cssText =
      'position:absolute;top:-7px;right:-9px;min-width:20px;height:20px;padding:0 5px;' +
      'border-radius:10px;border:2px solid #fff;box-sizing:border-box;background:' +
      (m.color ?? '#333') +
      ';color:#fff;font-size:11px;font-weight:700;line-height:16px;text-align:center;';
    root.appendChild(badge);
  }
  root.addEventListener('click', (e) => {
    e.stopPropagation();
    onPress();
  });
  return root;
}

export const KakaoMap = forwardRef<KakaoMapHandle, KakaoMapProps>(function KakaoMap(
  {
    markers,
    path,
    icons,
    selectable,
    centerLat,
    centerLng,
    height = 300,
    style,
    onSelect,
    onMarkerPress,
    onFailed,
    onBoundsChange,
  },
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
  const cbRef = useRef({ onSelect, onMarkerPress, onFailed, onBoundsChange });
  cbRef.current = { onSelect, onMarkerPress, onFailed, onBoundsChange };
  /** 시야 맞추기 여백 — 아래쪽은 하단 시트 높이(setPadding). kakaoMapHtml 의 fitPad 와 같은 뜻 */
  const padRef = useRef({ top: 40, right: 40, bottom: 40, left: 40 });
  /** 앱이 움직인 시야인지 — idle 이벤트의 byUser 판정(kakaoMapHtml 의 programmatic 과 같다) */
  const programmaticRef = useRef(false);

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
        // SDK 스크립트 로드(위 promise)는 도메인 미등록이어도 그냥 성공한다 — 실제 거부는
        // 타일 요청 단계에서 예외 없이 조용히 일어난다. 타일이 실제로 그려졌는지로 판단한다.
        let tilesLoaded = false;
        kakao.maps.event.addListener(mapRef.current, 'tilesloaded', () => {
          tilesLoaded = true;
        });
        setTimeout(() => {
          if (!disposed && !tilesLoaded) {
            setFailed(true);
            cbRef.current.onFailed?.();
          }
        }, 6000);
        kakao.maps.event.addListener(mapRef.current, 'idle', () => {
          const b = mapRef.current.getBounds();
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          cbRef.current.onBoundsChange?.({
            sw: { lat: sw.getLat(), lng: sw.getLng() },
            ne: { lat: ne.getLat(), lng: ne.getLng() },
            byUser: !programmaticRef.current,
          });
          programmaticRef.current = false;
        });
      })
      .catch(() => {
        if (!disposed) {
          setFailed(true);
          cbRef.current.onFailed?.();
        }
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
      let marker: any;
      if (m.imageUrl) {
        // 사진 핀 — 네이티브(kakaoMapHtml.ts photoPin)와 같은 모양. 꼭짓점이 좌표(yAnchor 1)
        marker = new kakao.maps.CustomOverlay({
          map,
          position: pos,
          xAnchor: 0.5,
          yAnchor: 1,
          clickable: true,
          content: photoPinElement(m, () => cbRef.current.onMarkerPress?.(m.id)),
        });
        marker.__fittoPin = true;
      } else {
        const markerOpts: any = { map, position: pos, title: m.title };
        const key = pinIconKey(m, icons);
        const ic = key ? icons?.[key] : undefined;
        if (ic) {
          markerOpts.image = new kakao.maps.MarkerImage(ic.url, new kakao.maps.Size(ic.width, ic.height), {
            offset: new kakao.maps.Point(ic.anchorX, ic.anchorY),
          });
        } else if (m.color) {
          markerOpts.image = pinImage(kakao, m.color, m.filled !== false);
        }
        if (m.selected) markerOpts.zIndex = 10;
        marker = new kakao.maps.Marker(markerOpts);
        kakao.maps.event.addListener(marker, 'click', () => cbRef.current.onMarkerPress?.(m.id));
      }
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
     * 화면 맞추기는 <b>처음 마커가 생겼을 때 한 번만</b> 한다.
     * 갱신마다 setBounds 를 부르면(여행 상세의 Day 전환 등) 사용자가 확대·이동해둔
     * 시야를 매번 빼앗는다. 예전엔 "처음 그릴 때"였는데, 목록이 늦게 오면 첫 그리기가 빈 마커라
     * 그 뒤 들어온 마커에 시야를 못 맞추고 서울시청에 머물렀다.
     */
    if (fittedRef.current) return;
    if (!(markers?.length) && !((path?.length ?? 0) > 1)) return;
    fittedRef.current = true;
    programmaticRef.current = true;
    if ((markers?.length ?? 0) > 1 || (path?.length ?? 0) > 1) {
      const pad = padRef.current;
      map.setBounds(bounds, pad.top, pad.right, pad.bottom, pad.left);
    } else if (markers?.length === 1) {
      map.setCenter(new kakao.maps.LatLng(markers[0].lat, markers[0].lng));
    }
  }, [ready, markers, path, icons]);

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
    fitToMarkers: () => {
      const kakao = (window as any).kakao;
      const map = mapRef.current;
      if (!kakao?.maps || !map) return;
      const bounds = new kakao.maps.LatLngBounds();
      const ms = overlaysRef.current.filter((o) => o instanceof kakao.maps.Marker || o.__fittoPin);
      ms.forEach((o) => bounds.extend(o.getPosition()));
      programmaticRef.current = true;
      if (ms.length > 1) {
        const pad = padRef.current;
        map.setBounds(bounds, pad.top, pad.right, pad.bottom, pad.left);
      } else if (ms.length === 1) {
        map.setCenter(ms[0].getPosition());
      }
    },
    setPadding: (pad) => {
      padRef.current = { ...padRef.current, ...pad };
    },
    panTo: (lat: number, lng: number) => {
      const kakao = (window as any).kakao;
      const map = mapRef.current;
      if (!kakao?.maps || !map) return;
      programmaticRef.current = true;
      map.panTo(new kakao.maps.LatLng(lat, lng));
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
