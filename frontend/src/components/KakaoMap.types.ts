/** KakaoMap 공유 Props — 네이티브(KakaoMap.tsx)/웹(KakaoMap.web.tsx) 공통 */
import type { ViewStyle } from 'react-native';
import type { KakaoMapMarker } from '../utils/kakaoMapHtml';

export interface KakaoMapProps {
  markers?: KakaoMapMarker[];
  /** 지도 탭으로 좌표 선택 (주소 자동 조회) */
  selectable?: boolean;
  centerLat?: number;
  centerLng?: number;
  height?: number;
  style?: ViewStyle;
  onSelect?: (pos: { lat: number; lng: number; address?: string | null }) => void;
  onMarkerPress?: (id: number) => void;
}
