/**
 * 카카오맵 HTML 생성 — 네이티브(WebView)와 웹(iframe)이 같은 HTML 을 렌더링한다.
 * 통신: 내부 → 외부 postMessage(JSON, source='fitto-kakao-map').
 */
import { KAKAO_JS_KEY } from '../constants/config';

export interface KakaoMapMarker {
  id: number;
  lat: number;
  lng: number;
  title: string;
}

export type KakaoMapMessage =
  | { source: 'fitto-kakao-map'; type: 'select'; lat: number; lng: number; address?: string | null }
  | { source: 'fitto-kakao-map'; type: 'marker'; id: number };

export interface KakaoMapOptions {
  markers?: KakaoMapMarker[];
  /** 지도 탭으로 좌표 선택 (주소 자동 조회 포함) */
  selectable?: boolean;
  centerLat?: number;
  centerLng?: number;
  level?: number;
}

// 기본 중심: 서울 시청
const DEFAULT_LAT = 37.5665;
const DEFAULT_LNG = 126.978;

export function parseKakaoMapMessage(raw: unknown): KakaoMapMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const data = JSON.parse(raw) as KakaoMapMessage;
    return data && data.source === 'fitto-kakao-map' ? data : null;
  } catch {
    return null;
  }
}

export function buildKakaoMapHtml(options: KakaoMapOptions): string {
  const markers = options.markers ?? [];
  const centerLat = options.centerLat ?? markers[0]?.lat ?? DEFAULT_LAT;
  const centerLng = options.centerLng ?? markers[0]?.lng ?? DEFAULT_LNG;
  const level = options.level ?? 5;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
<style>html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }</style>
</head>
<body>
<div id="map"></div>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false"></script>
<script>
function post(msg) {
  var s = JSON.stringify(Object.assign({ source: 'fitto-kakao-map' }, msg));
  if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(s); }
  else if (window.parent) { window.parent.postMessage(s, '*'); }
}
kakao.maps.load(function () {
  var map = new kakao.maps.Map(document.getElementById('map'), {
    center: new kakao.maps.LatLng(${centerLat}, ${centerLng}),
    level: ${level}
  });

  var markers = ${JSON.stringify(markers)};
  var bounds = new kakao.maps.LatLngBounds();
  markers.forEach(function (m) {
    var pos = new kakao.maps.LatLng(m.lat, m.lng);
    bounds.extend(pos);
    var marker = new kakao.maps.Marker({ map: map, position: pos, title: m.title });
    kakao.maps.event.addListener(marker, 'click', function () { post({ type: 'marker', id: m.id }); });
    new kakao.maps.CustomOverlay({
      map: map, position: pos, yAnchor: 0,
      content: '<div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:2px 8px;' +
               'font-size:11px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.15);white-space:nowrap;">' +
               m.title.replace(/</g, '&lt;') + '</div>'
    });
  });
  if (markers.length > 1) { map.setBounds(bounds, 40, 40, 40, 40); }

  ${options.selectable ? `
  var geocoder = new kakao.maps.services.Geocoder();
  var selMarker = null;
  kakao.maps.event.addListener(map, 'click', function (e) {
    var pos = e.latLng;
    if (selMarker) { selMarker.setPosition(pos); }
    else { selMarker = new kakao.maps.Marker({ map: map, position: pos }); }
    geocoder.coord2Address(pos.getLng(), pos.getLat(), function (res, status) {
      var addr = null;
      if (status === kakao.maps.services.Status.OK && res[0]) {
        addr = (res[0].road_address && res[0].road_address.address_name)
            || (res[0].address && res[0].address.address_name) || null;
      }
      post({ type: 'select', lat: pos.getLat(), lng: pos.getLng(), address: addr });
    });
  });` : ''}
});
</script>
</body>
</html>`;
}
