/**
 * 오운완 인증샷 업로드 전 안내 — <b>한 번만</b> 묻는다.
 *
 * <p><b>왜 필요한가</b>: 이 사진은 <b>애인의 우리 기록(피드)에 올라간다</b>. 어디까지 가는지
 * 모른 채 올리게 두면 안 된다. 사진에 위치가 딸려 갈 수 있다는 것도 같이 알린다 — 찍은 사진의
 * 메타데이터든, 배경에 찍힌 장소든.
 *
 * <p><b>2026-09-14 에 안내가 뒤집혔다.</b> 예전 이 기능은 러닝 앱 완료 화면을 AI 로 읽는
 * 용도였고, 그래서 안내가 "이 사진은 내 운동 기록에만 붙고 애인에게는 공유되지 않아요" 라고
 * <b>약속</b>했다. 오운완 인증샷으로 바뀌면서 그 약속이 더는 사실이 아니게 됐다. 그래서
 * (1) 문구를 고치고 (2) <b>확인 기록 키를 새로 뗐다</b> — 옛 안내를 보고 "확인했어요"를 누른
 * 사람은 "안 간다"에 동의한 것이라, 같은 키를 쓰면 바뀐 사실을 영영 못 본다.
 *
 * <p>이미 올라간 옛 사진에는 소급하지 않는다(백엔드 {@code Workout.imageShared} · V94).
 *
 * <p>매번 띄우지 않는 이유: 이 경로의 존재 이유가 "가장 낮은 마찰"인데 올릴 때마다 확인창이
 * 뜨면 그 이유가 사라진다. 알아야 할 사실은 처음 한 번이면 충분하고, 그 뒤로는 사용자가
 * 무엇을 올리는지 알고 있다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from './alert';

/*
 * v2 — 옛 키(…Ack)는 "애인에게 안 간다"는 안내에 대한 동의였다. 공유 범위가 바뀌었으므로
 * 그 동의를 그대로 물려받지 않는다. 옛 키는 지우지 않고 그냥 안 쓴다(되돌릴 여지를 남긴다).
 */
const ACK_KEY = 'doubly.workoutPhotoShareAck.v2';

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
    '애인에게도 보여요',
    '오운완 사진은 내 기록에 남고, 애인의 우리 기록에도 올라가요.\n\n사진에 위치가 담길 수 있어요 — 배경에 찍힌 장소나 러닝 앱 화면의 경로 지도처럼요. 기록을 지우면 사진도 함께 지워져요.',
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
