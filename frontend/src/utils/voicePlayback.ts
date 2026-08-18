/** 애인이 녹음한 음성 클립 재생 — 운동 중 정해진 순간(휴식 종료·PR·운동 완료)에 한 번 튼다 */
import { createAudioPlayer } from 'expo-audio';

/**
 * url 이 없으면(상대방이 그 문구를 아직 안 녹음했으면) 아무 일도 하지 않는다 — 호출부에서
 * null 체크를 반복하지 않도록 여기서 한 번에 처리한다.
 *
 * <p>재생은 fire-and-forget 이다. 실패해도(네트워크 오류·디코딩 실패 등) 운동 흐름을
 * 막을 정도의 일이 아니라 조용히 넘어간다.
 */
export function playVoiceClip(url: string | null | undefined) {
  if (!url) return;
  try {
    const player = createAudioPlayer(url);
    player.play();
    // 응원 문구는 길어야 몇 초 — 훅 없이 상태를 폴링하는 대신 넉넉한 시간 뒤 자원만 정리한다
    setTimeout(() => {
      try {
        player.remove();
      } catch {
        // 이미 정리됐으면 무시
      }
    }, 8000);
  } catch {
    // 재생 실패는 조용히 넘어간다
  }
}
