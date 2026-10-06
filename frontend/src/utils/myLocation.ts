/**
 * 지도의 "내 위치" — 권한을 묻고 지금 좌표를 한 번 읽는다(계속 따라가지 않는다).
 *
 * <p>위치는 기기 안에서 지도를 옮기는 데만 쓴다 — 서버로 보내지도, 저장하지도 않는다. 그래서 권한도
 * "앱을 쓰는 동안"만 묻는다(app.json 의 expo-location 설정에서 백그라운드·항상 허용을 꺼 두었다).
 *
 * <p>빠르게 보여 주려고 최근(2분 안) 마지막 위치가 있으면 그걸 먼저 쓴다. 없으면 새로 잡는데,
 * 실내에서 GPS 가 오래 안 잡히면 버튼이 멈춘 듯 보이므로 10초에서 끊는다.
 * 웹은 expo-location 이 브라우저 위치(navigator.geolocation)를 쓴다 — https 에서만 된다.
 */
import * as Location from 'expo-location';

export type MyLocationResult =
  | { kind: 'ok'; lat: number; lng: number }
  /** 거절했지만 다시 물을 수 있다 */
  | { kind: 'denied' }
  /** "다시 묻지 않음"·설정에서 꺼 둠 — 설정 화면으로 보내야 한다 */
  | { kind: 'blocked' }
  /** 위치 서비스가 꺼져 있거나 시간 안에 못 잡았다 */
  | { kind: 'unavailable' };

const LAST_KNOWN_MAX_AGE_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 10_000;

export async function getMyLocation(): Promise<MyLocationResult> {
  let permission: Location.LocationPermissionResponse;
  try {
    permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted' && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
  } catch {
    return { kind: 'unavailable' };
  }
  if (permission.status !== 'granted') {
    return permission.canAskAgain ? { kind: 'denied' } : { kind: 'blocked' };
  }

  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }).catch(() => null);
    const position =
      last ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
      ]));
    if (!position) return { kind: 'unavailable' };
    return { kind: 'ok', lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return { kind: 'unavailable' };
  }
}
