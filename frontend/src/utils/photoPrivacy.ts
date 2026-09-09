/**
 * 운동 인증샷 업로드 전 안내 — <b>한 번만</b> 묻는다.
 *
 * <p><b>왜 필요한가</b>: 인증샷은 대개 러닝 앱(스트라바·나이키런)의 완료 화면 캡처인데,
 * 그 화면에는 <b>달린 경로 지도</b>가 함께 찍혀 있다. 경로의 시작점은 보통 집이다.
 * 사용자가 "운동 기록을 올린다"고 생각하며 실제로는 집 위치를 올리는 상황을 만들면 안 된다.
 *
 * <p>동시에 <b>안심시키는 것도 이 안내의 역할</b>이다 — 이 사진은 내 기록에만 붙고 커플
 * 피드로 나가지 않는다(백엔드 FeedItemMapper 가 운동 카드에 이미지를 싣지 않으며,
 * {@code FeedFlowTest.운동_인증샷은_커플_피드에_노출되지_않는다} 가 그걸 고정한다).
 *
 * <p>매번 띄우지 않는 이유: 이 경로의 존재 이유가 "가장 낮은 마찰"인데 올릴 때마다 확인창이
 * 뜨면 그 이유가 사라진다. 알아야 할 사실은 처음 한 번이면 충분하고, 그 뒤로는 사용자가
 * 무엇을 올리는지 알고 있다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from './alert';

const ACK_KEY = 'doubly.workoutPhotoPrivacyAck';

/**
 * 안내 후 진행 — {@code confirmDiscard} 와 같은 콜백 방식이다.
 *
 * <p>Promise&lt;boolean&gt; 으로 만들지 않은 이유: 이 다이얼로그는 Android 백 버튼으로도
 * 닫히는데({@code ConfirmDialog} 의 onRequestClose), 그때는 어떤 버튼 콜백도 불리지 않아
 * Promise 가 영영 안 풀린다. 콜백이면 "닫힘 = 아무 일도 안 일어남"이 자연스러운 기본값이다.
 */
export async function confirmPhotoPrivacy(onProceed: () => void): Promise<void> {
  /*
   * 저장소 읽기에 실패하면 <b>안내를 띄우는 쪽</b>으로 넘어간다(모른다고 조용히 통과시키지
   * 않는다). 한 번 더 뜨는 건 불편이지만, 안 뜨는 건 위치가 담긴 사진을 모르고 올리는 일이다.
   */
  const acked = await AsyncStorage.getItem(ACK_KEY).catch(() => null);
  if (acked === 'true') {
    onProceed();
    return;
  }

  Alert.alert(
    '사진에 위치가 담길 수 있어요',
    '러닝 앱 화면에는 달린 경로 지도가 함께 찍혀 있을 수 있어요.\n\n이 사진은 내 운동 기록에만 붙고 애인에게는 공유되지 않아요. 기록을 지우면 사진도 함께 지워져요.',
    [
      { text: '취소', style: 'cancel' },
      {
        text: '확인했어요',
        onPress: () => {
          void AsyncStorage.setItem(ACK_KEY, 'true').catch(() => undefined);
          onProceed();
        },
      },
    ],
  );
}
