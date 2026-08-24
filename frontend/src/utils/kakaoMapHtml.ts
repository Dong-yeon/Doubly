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
  /** 커스텀 핀 색상(hex) — 미지정 시 카카오 기본(빨강) 핀 */
  color?: string;
  /** color 지정 시에만 의미 있음 — false 면 속이 빈 테두리 핀(예: 위시리스트). 미지정 시 채워진 핀(기존 동작 유지) */
  filled?: boolean;
  /** 럽슐랭 등급(1~3) — 지정하면 핀 우상단에 금색 등급 뱃지가 덧그려진다. 0/미지정 시 없음 */
  tier?: number;
}

/** 카카오 플레이스 키워드 검색 결과 1건 */
export interface KakaoPlaceResult {
  name: string;
  address?: string | null;
  /** 카카오 category_group_code (FD6=음식점, CE7=카페 등) */
  categoryGroup?: string | null;
  lat: number;
  lng: number;
}

export type KakaoMapMessage =
  | { source: 'fitto-kakao-map'; type: 'select'; lat: number; lng: number; address?: string | null }
  | { source: 'fitto-kakao-map'; type: 'marker'; id: number }
  | { source: 'fitto-kakao-map'; type: 'search-results'; keyword: string; results: KakaoPlaceResult[] };

/** 동선 폴리라인 좌표 (정렬 순서대로 이어 그린다) */
export interface KakaoLatLng {
  lat: number;
  lng: number;
}

export interface KakaoMapOptions {
  markers?: KakaoMapMarker[];
  /** 순서대로 이어 그릴 경로 (일정 동선). 2점 이상일 때만 표시 */
  path?: KakaoLatLng[];
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
  const path = options.path ?? [];
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

  // ---- 외부 명령 (RN: injectJavaScript / 웹: iframe postMessage) ----
  var selMarker = null;

  // 검색 결과 선택 시 핀 이동 + 지도 센터링 (좌표 전달은 RN 쪽에서 이미 처리)
  window.fittoSetPin = function (lat, lng) {
    var pos = new kakao.maps.LatLng(lat, lng);
    if (selMarker) { selMarker.setPosition(pos); }
    else { selMarker = new kakao.maps.Marker({ map: map, position: pos }); }
    map.setCenter(pos);
    if (map.getLevel() > 4) { map.setLevel(4); }
  };

  // 카카오 플레이스 키워드 검색 (SDK services 라이브러리 — 별도 REST 키 불필요)
  var places = new kakao.maps.services.Places();
  window.fittoSearch = function (keyword) {
    if (!keyword) { return; }
    places.keywordSearch(keyword, function (res, status) {
      var results = [];
      if (status === kakao.maps.services.Status.OK) {
        results = res.slice(0, 10).map(function (p) {
          return {
            name: p.place_name,
            address: p.road_address_name || p.address_name || null,
            categoryGroup: p.category_group_code || null,
            lat: parseFloat(p.y),
            lng: parseFloat(p.x)
          };
        });
      }
      post({ type: 'search-results', keyword: keyword, results: results });
    });
  };

  // 웹(iframe)은 postMessage 명령으로 호출
  window.addEventListener('message', function (e) {
    var d = e.data;
    try { if (typeof d === 'string') { d = JSON.parse(d); } } catch (err) { return; }
    if (!d || d.source !== 'fitto-kakao-map-cmd') { return; }
    if (d.type === 'search') { window.fittoSearch(d.keyword); }
    if (d.type === 'pin') { window.fittoSetPin(d.lat, d.lng); }
    if (d.type === 'markers') { window.fittoSetMarkers(d.markers, d.path, false); }
  });

  // 색상 지정 핀 — 원형 SVG 를 데이터 URI 로 인라인 렌더링 (외부 이미지 호스팅 불필요)
  // filled=false 면 속을 비우고 테두리만 색을 입힌다 — 색(예: 식단 구분)과는 별개 축(예: 방문 여부)을 표현할 때 쓴다.
  // tier(1~3)가 있으면 우상단에 금색 등급 뱃지를 덧그린다 — 럽슐랭 인증 여부는 또 다른 별개 축이다.
  // 이미지 캔버스를 32x32 로 늘려도 원의 중심(=지도 좌표 앵커)은 그대로 (14,14) 라 핀 위치는 안 밀린다.
  function pinImage(color, filled, tier) {
    var circle = filled
      ? '<circle cx="14" cy="14" r="10" fill="' + color + '" stroke="#ffffff" stroke-width="3"/>'
      : '<circle cx="14" cy="14" r="10" fill="#ffffff" stroke="' + color + '" stroke-width="3"/>';
    var badge = tier > 0
      ? '<circle cx="23" cy="7" r="6.5" fill="#D4A017" stroke="#ffffff" stroke-width="1.5"/>' +
        '<text x="23" y="10" font-size="8" font-weight="700" text-anchor="middle" fill="#ffffff">' + tier + '</text>'
      : '';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">' + circle + badge + '</svg>';
    var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return new kakao.maps.MarkerImage(url, new kakao.maps.Size(32, 32), {
      offset: new kakao.maps.Point(14, 14)
    });
  }

  /*
   * 마커·동선 그리기를 함수로 둔다.
   *
   * 예전에는 마커 목록이 바뀔 때마다 HTML 전체를 다시 만들어 WebView 를 리로드했다.
   * 그러면 카카오 SDK 를 매번 다시 받고, 사용자가 잡아둔 확대·중심이 초기화된다
   * (여행 상세에서 Day 를 누를 때마다 지도가 하얗게 깜빡였다).
   * 이제 fittoSetMarkers 만 호출해 그린 것만 바꾼다.
   */
  var drawn = [];
  window.fittoSetMarkers = function (markers, path, fit) {
    drawn.forEach(function (o) { o.setMap(null); });
    drawn = [];

    var bounds = new kakao.maps.LatLngBounds();
    markers.forEach(function (m) {
      var pos = new kakao.maps.LatLng(m.lat, m.lng);
      bounds.extend(pos);
      var markerOpts = { map: map, position: pos, title: m.title };
      if (m.color) { markerOpts.image = pinImage(m.color, m.filled !== false, m.tier || 0); }
      var marker = new kakao.maps.Marker(markerOpts);
      kakao.maps.event.addListener(marker, 'click', function () { post({ type: 'marker', id: m.id }); });
      drawn.push(marker);
      var label = new kakao.maps.CustomOverlay({
        map: map, position: pos, yAnchor: 0,
        content: '<div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:2px 8px;' +
                 'font-size:11px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.15);white-space:nowrap;">' +
                 m.title.replace(/</g, '&lt;') + '</div>'
      });
      drawn.push(label);
    });

    // 동선 폴리라인 — 일정 순서대로 이어 그린다 (2점 이상)
    if (path.length > 1) {
      var linePath = path.map(function (p) { return new kakao.maps.LatLng(p.lat, p.lng); });
      var line = new kakao.maps.Polyline({
        map: map, path: linePath,
        strokeWeight: 4, strokeColor: '#4A5BFF', strokeOpacity: 0.85, strokeStyle: 'solid'
      });
      drawn.push(line);
      path.forEach(function (p) { bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)); });
    }

    // 화면 맞추기는 처음 그릴 때만 — 갱신마다 하면 사용자가 옮긴 시야를 뺏는다
    if (fit && (markers.length > 1 || path.length > 1)) { map.setBounds(bounds, 40, 40, 40, 40); }
  };

  window.fittoSetMarkers(${JSON.stringify(markers)}, ${JSON.stringify(path)}, true);

  ${options.selectable ? `
  var geocoder = new kakao.maps.services.Geocoder();
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
