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
  /**
   * 사진 핀 — 주면 동그란 핀 대신 이 사진을 52px 둥근 사각형으로 꽂는다(사진첩 지도).
   * 작은 썸네일 URL 을 넘길 것 — 지도 위에 원본 수십 장을 받으면 무겁다.
   */
  imageUrl?: string;
  /** 사진 핀 우상단 장수 뱃지 — 2 이상일 때만 그린다(imageUrl 이 있을 때만 의미) */
  count?: number;
  /**
   * 미리 그려 둔 핀 모양의 키 — {@link KakaoMapOptions.icons} 에서 찾는다. 주면 color/filled/tier 대신 쓴다.
   * 럽슐랭 지도의 등극·다녀옴·안 가봄·검색 결과 핀(buildPlacePinIcons).
   */
  icon?: string;
  /** 고른 핀 — 다른 핀 위에 그린다(z-index). 모양은 icon 키의 `-selected` 짝을 쓴다 */
  selected?: boolean;
}

/** 핀 이미지 한 벌 — SVG 데이터 URI + 크기 + 좌표가 닿는 점(앵커) */
export interface KakaoPinIcon {
  url: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

export type KakaoMapMessage =
  | { source: 'fitto-kakao-map'; type: 'select'; lat: number; lng: number; address?: string | null }
  | { source: 'fitto-kakao-map'; type: 'marker'; id: number }
  /** SDK 로드 실패·도메인 미등록 등 — 지도가 정상 동작하지 않는다는 신호 (buildKakaoMapHtml 하단 주석 참고) */
  | { source: 'fitto-kakao-map'; type: 'failed'; reason?: string }
  /** 지도가 멈췄다(idle) — 지금 보이는 범위. 사용자가 움직였을 때만 byUser=true("이 지역 장소 보기"를 띄울지) */
  | { source: 'fitto-kakao-map'; type: 'bounds'; sw: KakaoLatLng; ne: KakaoLatLng; byUser: boolean };

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
  /** 마커의 icon 키가 가리키는 핀 이미지들 — buildPlacePinIcons 결과 */
  icons?: Record<string, KakaoPinIcon>;
}

// 기본 중심: 서울 시청
const DEFAULT_LAT = 37.5665;
const DEFAULT_LNG = 126.978;

function svgUri(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * 럽슐랭 장소 핀(+ 고른 상태) — 네이티브(WebView)와 웹(KakaoMap.web.tsx)이 <b>같은 이미지</b>를 쓴다.
 *
 * <p>왜 앱 쪽에서 그리나: 지도는 두 벌(WebView HTML / 웹 메인 문서)이라 핀을 각자 그리면 모양이 갈린다 —
 * 실제로 웹 핀에는 등급 배지가 빠져 있었다. SVG 문자열을 여기서 한 번 만들어 둘 다에 넘긴다.
 * 아이콘 폰트 글리프는 쓰지 않는다(폰트는 fingerprint 입력이라 업데이트가 막힌다) — 왕관도 SVG 도형으로 그린다.
 *
 * <ul>
 *   <li>certified — 금색 원 + 흰 왕관(럽슐랭 등극)</li>
 *   <li>visited — 채운 원(다녀옴)</li>
 *   <li>wish — 흰 원 + 색 테두리(아직 안 가봄 = 방문 0건)</li>
 *   <li>search — 검색 결과 임시 핀. 우리 장소와 헷갈리지 않게 원이 아니라 꼬리 달린 물방울 모양</li>
 * </ul>
 */
export function buildPlacePinIcons(palette: { gold: string; visited: string; search: string }): Record<string, KakaoPinIcon> {
  const icons: Record<string, KakaoPinIcon> = {};
  // 왕관 — 가운데 (cx, cy), 폭 12k. 봉우리 셋 + 받침
  const crown = (cx: number, cy: number, k: number) => {
    const p = (x: number, y: number) => `${(cx + x * k).toFixed(1)},${(cy + y * k).toFixed(1)}`;
    const pts = [p(-6, 3), p(-6, -3), p(-3, 0), p(0, -5), p(3, 0), p(6, -3), p(6, 3)].join(' ');
    return (
      `<polygon points="${pts}" fill="#ffffff"/>` +
      `<rect x="${(cx - 6 * k).toFixed(1)}" y="${(cy + 3.6 * k).toFixed(1)}" width="${(12 * k).toFixed(1)}" height="${(1.8 * k).toFixed(1)}" fill="#ffffff"/>`
    );
  };
  const circlePin = (key: string, scale: number, body: (c: number, r: number) => string) => {
    const size = Math.round(28 * scale);
    const c = size / 2;
    icons[key] = {
      url: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${body(c, 10 * scale)}</svg>`),
      width: size,
      height: size,
      anchorX: c,
      anchorY: c,
    };
  };
  for (const [suffix, scale] of [['', 1], ['-selected', 1.35]] as const) {
    circlePin(
      `certified${suffix}`,
      scale,
      (c, r) =>
        `<circle cx="${c}" cy="${c}" r="${r + 1}" fill="${palette.gold}" stroke="#ffffff" stroke-width="${2.5 * scale}"/>` +
        crown(c, c - 0.5 * scale, 0.75 * scale),
    );
    circlePin(
      `visited${suffix}`,
      scale,
      (c, r) => `<circle cx="${c}" cy="${c}" r="${r}" fill="${palette.visited}" stroke="#ffffff" stroke-width="${3 * scale}"/>`,
    );
    circlePin(
      `wish${suffix}`,
      scale,
      (c, r) => `<circle cx="${c}" cy="${c}" r="${r}" fill="#ffffff" stroke="${palette.visited}" stroke-width="${3 * scale}"/>`,
    );
    // 검색 결과 — 물방울(꼬리 끝이 좌표). 원 핀과 실루엣이 달라 "아직 우리 장소가 아님"이 보인다
    const w = Math.round(26 * scale);
    const h = Math.round(34 * scale);
    const cx = w / 2;
    const r = 10 * scale;
    const cy = r + 2 * scale;
    const d =
      `M${cx} ${h - 1} C ${cx - 3 * scale} ${cy + r * 0.9}, ${cx - r} ${cy + r * 0.55}, ${cx - r} ${cy} ` +
      `A ${r} ${r} 0 1 1 ${cx + r} ${cy} C ${cx + r} ${cy + r * 0.55}, ${cx + 3 * scale} ${cy + r * 0.9}, ${cx} ${h - 1} Z`;
    icons[`search${suffix}`] = {
      url: svgUri(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
          `<path d="${d}" fill="${palette.search}" stroke="#ffffff" stroke-width="${2 * scale}"/>` +
          `<circle cx="${cx}" cy="${cy}" r="${3.5 * scale}" fill="#ffffff"/></svg>`,
      ),
      width: w,
      height: h,
      anchorX: cx,
      anchorY: h - 1,
    };
  }
  return icons;
}

/** 고른 핀이면 `-selected` 짝 키 — 짝이 없으면 원래 키, 키가 없으면 null(기존 color 핀) */
export function pinIconKey(m: KakaoMapMarker, icons: Record<string, KakaoPinIcon> | undefined): string | null {
  if (!m.icon || !icons) return null;
  const sel = `${m.icon}-selected`;
  if (m.selected && icons[sel]) return sel;
  return icons[m.icon] ? m.icon : null;
}

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
<script>
function post(msg) {
  var s = JSON.stringify(Object.assign({ source: 'fitto-kakao-map' }, msg));
  if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(s); }
  else if (window.parent) { window.parent.postMessage(s, '*'); }
}
/*
 * 지도 실패 감지 — 카카오 SDK 는 도메인 미등록/키 오류 시 예외를 던지지 않고
 * alert() 로 사용자에게 직접 띄우거나(WebView 에선 원인 모를 네이티브 팝업으로 보인다),
 * 타일 요청만 조용히 막혀 회색 빈 지도로 남는다. 셋 다 여기서 잡아 앱에 알린다.
 */
var fittoMapReady = false;
window.alert = function (msg) { post({ type: 'failed', reason: String(msg) }); };
window.onerror = function (msg) { post({ type: 'failed', reason: String(msg) }); return true; };
setTimeout(function () {
  if (!fittoMapReady) { post({ type: 'failed', reason: 'timeout' }); }
}, 6000);
</script>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false"
        onerror="post({ type: 'failed', reason: 'sdk-load-error' })"></script>
<script>
kakao.maps.load(function () {
  var map = new kakao.maps.Map(document.getElementById('map'), {
    center: new kakao.maps.LatLng(${centerLat}, ${centerLng}),
    level: ${level}
  });
  // SDK 라이브러리 로드(kakao.maps.load 콜백)는 도메인 미등록이어도 그냥 성공한다 —
  // 실제 거부는 타일 요청 단계에서 조용히 일어나므로, 타일이 실제로 그려졌는지로 판단한다.
  kakao.maps.event.addListener(map, 'tilesloaded', function () { fittoMapReady = true; });

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

  // 장소 검색은 지도가 하지 않는다 — 서버 GET /places/search(카카오 로컬 REST)가 카카오 장소 id 까지
  // 돌려줘 중복 방지가 된다. SDK keywordSearch 는 id 를 버려 같은 장소가 두 번 생기곤 했다
  // (docs/LOVELICHELIN_CHAT_LINK_2026-10-02.md). 지도는 표시와 좌표 고르기만 맡는다.

  // 웹(iframe)은 postMessage 명령으로 호출
  window.addEventListener('message', function (e) {
    var d = e.data;
    try { if (typeof d === 'string') { d = JSON.parse(d); } } catch (err) { return; }
    if (!d || d.source !== 'fitto-kakao-map-cmd') { return; }
    if (d.type === 'pin') { window.fittoSetPin(d.lat, d.lng); }
    if (d.type === 'markers') { window.fittoSetMarkers(d.markers, d.path, false); }
    if (d.type === 'fit') { window.fittoFitMarkers(); }
    if (d.type === 'padding') { window.fittoSetPadding(d.padding); }
    if (d.type === 'panTo') { window.fittoPanTo(d.lat, d.lng, d.offsetY); }
    if (d.type === 'clearPin') { window.fittoClearPin(); }
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
  /*
   * 사진 핀 — 52px 둥근 사진 + 흰 테두리 + 아래 꼬리(꼭짓점이 좌표). 장수 뱃지는 우상단.
   * KakaoMap.web.tsx 의 photoPinElement 와 <b>같은 모양</b>이어야 한다(네이티브·웹이 따로 그린다).
   * URL·글자는 innerHTML 로 잇지 않고 DOM 속성으로 넣는다 — 이름에 따옴표·꺾쇠가 있어도 안전하다.
   */
  function photoPin(m, color) {
    var root = document.createElement('div');
    root.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;';
    var box = document.createElement('div');
    box.style.cssText = 'width:52px;height:52px;border-radius:12px;border:3px solid #fff;overflow:hidden;' +
      'background:#eee;box-shadow:0 2px 6px rgba(0,0,0,.3);box-sizing:border-box;';
    var img = document.createElement('img');
    img.src = m.imageUrl;
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    box.appendChild(img);
    var tail = document.createElement('div');
    tail.style.cssText = 'width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;' +
      'border-top:8px solid #fff;margin-top:-1px;filter:drop-shadow(0 2px 1px rgba(0,0,0,.2));';
    root.appendChild(box);
    root.appendChild(tail);
    if (m.count && m.count > 1) {
      var badge = document.createElement('div');
      badge.textContent = m.count > 99 ? '99+' : String(m.count);
      badge.style.cssText = 'position:absolute;top:-7px;right:-9px;min-width:20px;height:20px;padding:0 5px;' +
        'border-radius:10px;border:2px solid #fff;box-sizing:border-box;background:' + (color || '#333') + ';' +
        'color:#fff;font-size:11px;font-weight:700;line-height:16px;text-align:center;';
      root.appendChild(badge);
    }
    root.addEventListener('click', function (e) { e.stopPropagation(); post({ type: 'marker', id: m.id }); });
    return root;
  }

  var drawn = [];
  var icons = ${JSON.stringify(options.icons ?? {})};
  function iconImage(m) {
    if (!m.icon) { return null; }
    var key = (m.selected && icons[m.icon + '-selected']) ? m.icon + '-selected' : m.icon;
    var ic = icons[key];
    if (!ic) { return null; }
    return new kakao.maps.MarkerImage(ic.url, new kakao.maps.Size(ic.width, ic.height), {
      offset: new kakao.maps.Point(ic.anchorX, ic.anchorY)
    });
  }
  window.fittoSetMarkers = function (markers, path, fit, nextIcons) {
    if (nextIcons) { icons = nextIcons; }
    drawn.forEach(function (o) { o.setMap(null); });
    drawn = [];

    var bounds = new kakao.maps.LatLngBounds();
    markers.forEach(function (m) {
      var pos = new kakao.maps.LatLng(m.lat, m.lng);
      bounds.extend(pos);
      if (m.imageUrl) {
        // 사진 핀 — 아래 꼭짓점이 좌표에 오도록 yAnchor 1. clickable 이라 지도 탭(좌표 선택)으로 새지 않는다
        drawn.push(new kakao.maps.CustomOverlay({
          map: map, position: pos, xAnchor: 0.5, yAnchor: 1, clickable: true, content: photoPin(m, m.color)
        }));
      } else {
        var markerOpts = { map: map, position: pos, title: m.title };
        var ic = iconImage(m);
        if (ic) { markerOpts.image = ic; }
        else if (m.color) { markerOpts.image = pinImage(m.color, m.filled !== false, m.tier || 0); }
        if (m.selected) { markerOpts.zIndex = 10; }
        var marker = new kakao.maps.Marker(markerOpts);
        kakao.maps.event.addListener(marker, 'click', function () { post({ type: 'marker', id: m.id }); });
        drawn.push(marker);
      }
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

    // 화면 맞추기는 부른 쪽이 정한다(처음 그릴 때·검색 결과) — 갱신마다 하면 사용자가 옮긴 시야를 뺏는다
    if (fit && (markers.length > 1 || path.length > 1)) { fitTo(bounds); }
    else if (fit && markers.length === 1) {
      programmatic = true;
      map.setCenter(new kakao.maps.LatLng(markers[0].lat, markers[0].lng));
    }
  };

  /*
   * 시야 맞추기. 아래 여백은 하단 시트가 덮는 높이다 — 그만큼 비워 맞춰야 시트에 가린 핀이 없다.
   * 앱이 시트 높이를 바꿀 때 fittoSetPadding 으로 알려 준다.
   */
  var fitPad = { top: 40, right: 40, bottom: 40, left: 40 };
  window.fittoSetPadding = function (pad) { fitPad = Object.assign(fitPad, pad || {}); };
  var programmatic = false;
  function fitTo(bounds) {
    programmatic = true;
    map.setBounds(bounds, fitPad.top, fitPad.right, fitPad.bottom, fitPad.left);
  }
  window.fittoFitMarkers = function () {
    var bounds = new kakao.maps.LatLngBounds();
    var n = 0;
    drawn.forEach(function (o) { if (o instanceof kakao.maps.Marker) { bounds.extend(o.getPosition()); n++; } });
    if (n > 1) { fitTo(bounds); }
    else if (n === 1) { programmatic = true; map.setCenter(bounds.getSouthWest()); }
  };
  /*
   * 고른 핀으로 시야 옮기기 — 확대 단계는 그대로 둔다(사용자가 맞춘 축척을 뺏지 않는다).
   * offsetY(px): 핀을 지도 한가운데보다 이만큼 위에 둔다 — 아래쪽을 하단 시트가 덮고 있어서다.
   */
  window.fittoPanTo = function (lat, lng, offsetY) {
    programmatic = true;
    var target = new kakao.maps.LatLng(lat, lng);
    if (offsetY) {
      var proj = map.getProjection();
      var pt = proj.containerPointFromCoords(target);
      target = proj.coordsFromContainerPoint(new kakao.maps.Point(pt.x, pt.y + offsetY));
    }
    map.panTo(target);
  };
  // 좌표 고르기 핀 지우기 — 고른 걸 취소했을 때
  window.fittoClearPin = function () { if (selMarker) { selMarker.setMap(null); selMarker = null; } };

  /*
   * 지도가 멈출 때마다(idle) 보이는 범위를 알린다. 사용자가 끌거나 확대했는지(byUser)를 같이 보낸다 —
   * 앱이 setBounds·panTo 로 움직인 건 "이 지역 장소 보기" 버튼을 띄울 이유가 아니다.
   */
  kakao.maps.event.addListener(map, 'idle', function () {
    var b = map.getBounds();
    var sw = b.getSouthWest();
    var ne = b.getNorthEast();
    post({ type: 'bounds', sw: { lat: sw.getLat(), lng: sw.getLng() }, ne: { lat: ne.getLat(), lng: ne.getLng() }, byUser: !programmatic });
    programmatic = false;
  });

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
