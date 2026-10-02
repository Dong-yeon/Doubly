/** KakaoMap 공유 Props — 네이티브(KakaoMap.tsx)/웹(KakaoMap.web.tsx) 공통 */
import type { ViewStyle } from 'react-native';
import type { KakaoLatLng, KakaoMapMarker } from '../utils/kakaoMapHtml';

export interface KakaoMapProps {
  markers?: KakaoMapMarker[];
  /** 순서대로 이어 그릴 동선 (일정 경로). 2점 이상일 때만 표시 */
  path?: KakaoLatLng[];
  /** 지도 탭으로 좌표 선택 (주소 자동 조회) */
  selectable?: boolean;
  centerLat?: number;
  centerLng?: number;
  height?: number;
  style?: ViewStyle;
  onSelect?: (pos: { lat: number; lng: number; address?: string | null }) => void;
  onMarkerPress?: (id: number) => void;
}

/** ref 로 노출되는 명령 — 핀 이동. 장소 검색은 서버(GET /places/search)가 한다 */
export interface KakaoMapHandle {
  setPin: (lat: number, lng: number) => void;
}
