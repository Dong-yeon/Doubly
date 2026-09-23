/**
 * 통화 전 마이크·카메라 권한 — <b>통화가 조용히 죽던 진짜 원인</b>(2026-09-23).
 *
 * <p>앱에는 이 요청이 <b>한 군데도 없었다.</b> 유일한 권한 요청은 사진 업로드용
 * 카메라(`imageUpload.ts`)라 통화 경로와 무관했다. 그래서 통화를 걸면 Stream SDK 가
 * {@code getUserMedia} 를 부르고, OS 가 권한이 없다며 거절하고, SDK 는 경고만 남긴 채
 * 진행한다 — 화면에는 통화창이 그대로 떠 있고 소리만 없다.
 *
 * <pre>
 *   ERROR: [devices]: Failed to get audio stream  { name: 'SecurityError', message: 'Permission denied.' }
 *   WARN:  [Call]: Mic init failed                { name: 'SecurityError', ... }
 *   WARN:  [SfuStatsReporter]: ... [Error: SFU rejected stats: call not found]   ← 10초마다 반복
 * </pre>
 *
 * <p>실기기(안드로이드 태블릿) 로그에서 위 세 줄을 그대로 확인했고, 같은 시점
 * {@code dumpsys package} 의 {@code RECORD_AUDIO: granted=false} 와 일치했다.
 *
 * <p><b>왜 "네이티브 빌드 문제"로 오래 오해했나</b>: 증상("연결은 되는데 소리가 없고 금방
 * 끊긴다")이 네이티브 미디어 층이 빠졌을 때와 똑같다. 매니페스트에 권한이
 * <b>선언</b>돼 있는 것과 사용자가 <b>허용</b>한 것은 다른 문제인데, 선언만 확인하고
 * 넘어갔다(`docs/CALL_BROKEN_ANALYSIS_2026-09-10.md` §5).
 *
 * <p><b>iOS 도 안전하지 않다</b>: 처음 한 번은 OS 가 알아서 묻지만(Info.plist 의
 * `microphonePermission` 문구가 그것), 그때 거부하면 <b>다시는 묻지 않고</b> 안드로이드와
 * 똑같이 조용히 실패한다. 그래서 플랫폼 분기 없이 양쪽 다 여기서 확인한다.
 *
 * <p>`expo-camera` 의 권한 API 를 쓰는 이유는 {@code canAskAgain} 때문이다 —
 * "아직 안 물어봤다"와 "사용자가 껐다"를 구분해야 안내 문구를 다르게 줄 수 있다.
 * 후자는 앱이 아무리 요청해도 팝업이 안 뜨므로 설정으로 보내야 한다.
 * 마이크도 같은 모듈에서 가져온다 — `expo-audio` 에도 같은 API 가 있지만, 한 통화가 쓰는
 * 두 권한을 서로 다른 모듈로 나눠 요청하면 동작이 어긋났을 때 추적할 곳이 둘이 된다.
 */
import { Camera } from 'expo-camera';
import type { CallType } from '../api/call';

export interface CallPermissionResult {
  granted: boolean;
  /** 거부됐을 때 사용자에게 보여줄 문구 — 다시 물어볼 수 있는지에 따라 달라진다 */
  message?: string;
  /** true 면 앱이 다시 물어볼 수 없다 → 기기 설정으로 보내야 한다 */
  openSettings?: boolean;
}

const GRANTED: CallPermissionResult = { granted: true };

/**
 * 통화에 필요한 권한을 확보한다. 음성은 마이크만, 영상은 마이크+카메라.
 *
 * <p><b>서버 세션을 만들기 전에</b> 부른다 — 권한이 없으면 통화 자체가 성립하지 않는데
 * 먼저 세션을 만들면 상대에게 헛벨이 가고 `call_sessions` 에 쓰레기 행이 남는다.
 */
export async function ensureCallPermissions(callType: CallType): Promise<CallPermissionResult> {
  const mic = await Camera.requestMicrophonePermissionsAsync();
  if (!mic.granted) {
    return {
      granted: false,
      openSettings: !mic.canAskAgain,
      message: mic.canAskAgain
        ? '통화하려면 마이크 권한이 필요해요.'
        : '마이크 권한이 꺼져 있어요. 설정에서 켜주세요.',
    };
  }

  if (callType !== 'VIDEO') return GRANTED;

  /*
   * 카메라는 영상통화일 때만 묻는다 — 음성통화에 카메라 팝업이 뜨면 그 자체가 불신을 준다.
   * 마이크가 먼저 통과한 뒤라 팝업이 연달아 두 번 뜨지는 않는다.
   */
  const cam = await Camera.requestCameraPermissionsAsync();
  if (!cam.granted) {
    return {
      granted: false,
      openSettings: !cam.canAskAgain,
      message: cam.canAskAgain
        ? '영상통화하려면 카메라 권한이 필요해요.'
        : '카메라 권한이 꺼져 있어요. 설정에서 켜주세요.',
    };
  }

  return GRANTED;
}
