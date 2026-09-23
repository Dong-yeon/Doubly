/**
 * 채팅방 사진 배경 — 고른 사진을 <b>앱 문서 폴더에 복사</b>해 두고 그 경로를 돌려준다.
 *
 * <p><b>왜 복사하나</b>: 피커와 `expo-image-manipulator` 가 주는 uri 는 전부 캐시
 * 디렉터리다. 캐시는 기기 용량이 모자라면 시스템이 예고 없이 비우는 곳이라, 그대로
 * 저장하면 며칠 뒤 배경이 사라진다. 문서 폴더는 지워지지 않는다({@link Paths} 주석).
 *
 * <p><b>왜 서버에 안 올리나</b>: 배경은 기기별 취향 설정이다(chatThemeStore 상단 주석의
 * 판단 그대로). 올리면 Cloudinary 업로드 · 관계 단위 삭제 경로 · Purger 순서가 딸려오는데,
 * 얻는 건 "기기를 바꿔도 배경이 따라온다" 하나뿐이다.
 *
 * <p>웹은 {@code .web.ts} 로 갈린다 — 브라우저에는 이 파일 시스템이 없다.
 */
import { Dimensions } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { pickImageAsset, shrinkImage } from './imageUpload';

/** 이 플랫폼에서 사진 배경을 쓸 수 있는가 — 화면이 버튼을 그릴지 정하는 값 */
export const CAN_USE_CHAT_PHOTO = true;

/** 파일명 앞머리 — 지울 때 우리 것인지 가려내는 표시이기도 하다 */
const PREFIX = 'chat-bg-';

/**
 * 저장할 장변 상한.
 *
 * <p>{@code Dimensions} 는 dp 를 돌려주므로 3배 기기에서 딱 맞추려면 ×3 이 맞지만,
 * 전체 화면에 깔리는 비트맵이라 그만큼 메모리를 문다. ×2 면 눈으로 구분이 안 가는
 * 선이라 거기서 끊고, 태블릿에서 과하게 커지지 않게 한 번 더 막는다.
 */
function targetSide(): number {
  const { width, height } = Dimensions.get('window');
  return Math.min(2000, Math.round(Math.max(width, height) * 2));
}

/**
 * 갤러리에서 배경 사진을 고른다 — 축소·복사까지 끝낸 <b>영구 경로</b>를 돌려준다.
 * 취소하거나 권한을 거부하면 null.
 */
export async function pickChatBackgroundPhoto(): Promise<string | null> {
  const picked = await pickImageAsset();
  if (!picked) return null;

  const shrunk = await shrinkImage(picked, targetSide());
  /*
   * 파일명에 시각을 박는다 — 같은 이름으로 덮어쓰면 <Image> 가 uri 를 키로 캐시하고
   * 있어서 <b>바꿔도 옛 사진이 그대로 보인다</b>. 앞 파일은 스토어가 지운다.
   */
  const destination = new File(Paths.document, `${PREFIX}${Date.now()}.jpg`);
  await new File(shrunk).copy(destination);
  return destination.uri;
}

/**
 * 다 쓴 배경 파일을 지운다 — 실패해도 조용히 넘긴다.
 *
 * <p>이건 <b>청소</b>지 기능이 아니다. 여기서 던지면 "배경 바꾸기"가 통째로 실패하는데,
 * 사용자가 원한 일(새 배경 적용)은 이미 끝난 뒤다. 남은 파일 하나가 더 나쁘지 않다.
 */
export function deleteChatBackgroundPhoto(uri: string): void {
  if (!uri.includes(PREFIX)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // 무시 — 다음 교체 때 다시 시도되고, 안 돼도 사진 한 장이다
  }
}
