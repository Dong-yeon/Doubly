/**
 * 네비게이션 컨테이너 밖(푸시 알림 응답 리스너 등)에서 화면을 전환하기 위한 전역 ref.
 * RootNavigator 의 NavigationContainer 에 부착한다 — 그 전에는 isReady() 가 false다.
 */
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
