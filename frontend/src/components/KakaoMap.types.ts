/** KakaoMap 공유 Props — 네이티브(KakaoMap.tsx)/웹(KakaoMap.web.tsx) 공통 */
import type { ViewStyle } from 'react-native';
import type { KakaoLatLng, KakaoMapMarker, KakaoPinIcon } from '../utils/kakaoMapHtml';

export interface KakaoMapProps {
  markers?: KakaoMapMarker[];
  /** 순서대로 이어 그릴 동선 (일정 경로). 2점 이상일 때만 표시 */
  path?: KakaoLatLng[];
  /** 마커의 icon 키가 가리키는 핀 이미지 — buildPlacePinIcons(utils/kakaoMapHtml) 결과 */
  icons?: Record<string, KakaoPinIcon>;
  /** 지도 탭으로 좌표 선택 (주소 자동 조회) */
  selectable?: boolean;
  centerLat?: number;
  centerLng?: number;
  height?: number;
  style?: ViewStyle;
  onSelect?: (pos: { lat: number; lng: number; address?: string | null }) => void;
  onMarkerPress?: (id: number) => void;
  /**
   * 지도를 쓸 수 없다(SDK 로드 실패·도메인 미등록·타일 6초 무응답) — 부르는 쪽이 다른 화면으로 물러설 때 쓴다.
   * 안 주면 지도 자리에 안내문만 뜬다(예전 동작).
   */
  onFailed?: () => void;
  /** 지도가 멈출 때마다 보이는 범위. byUser 는 사용자가 끌거나 확대해서 움직였을 때만 true */
  onBoundsChange?: (bounds: { sw: KakaoLatLng; ne: KakaoLatLng; byUser: boolean }) => void;
}

/** ref 로 노출되는 명령. 장소 검색은 서버(GET /places/search)가 한다 */
export interface KakaoMapHandle {
  /** 선택 핀 하나를 옮기고 그 자리로 간다(장소 추가·수정 화면) */
  setPin: (lat: number, lng: number) => void;
  /** 지금 그려진 마커가 다 보이게 시야를 맞춘다 */
  fitToMarkers: () => void;
  /** 시야 맞추기 여백 — 아래쪽은 하단 시트가 덮는 높이를 넘긴다 */
  setPadding: (pad: { top?: number; right?: number; bottom?: number; left?: number }) => void;
  /** 그 좌표로 부드럽게 옮긴다(확대 단계는 그대로). offsetY 만큼 화면 가운데보다 위에 둔다(하단 시트가 덮는 몫) */
  panTo: (lat: number, lng: number, offsetY?: number) => void;
  /** 지도 탭으로 고른 좌표 핀을 지운다 */
  clearPin: () => void;
  /** 이 좌표들이 다 보이게 시야를 맞춘다(검색 결과) — 여백은 setPadding 값을 쓴다 */
  fitPoints: (points: KakaoLatLng[]) => void;
}
