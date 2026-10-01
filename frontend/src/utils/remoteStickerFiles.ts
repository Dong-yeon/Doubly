/**
 * 서버 배포 스티커의 애니메이션 파일 — 한 번 받아 <b>문서 폴더</b>에 두고 다시 받지 않는다.
 *
 * <p><b>왜 문서 폴더인가</b>: 캐시 폴더는 용량이 모자라면 시스템이 예고 없이 비운다
 * (utils/chatBackgroundPhoto 와 같은 판단). 지워지면 지난 말풍선이 다시 받을 때까지 썸네일로만 보인다.
 *
 * <p><b>파일 이름 = 서버 파일 이름</b>(코드 + 내용 해시). 그림이 바뀌면 이름이 바뀌므로 무효화가 따로
 * 없다. 쓰지 않게 된 옛 파일은 남는데, 장당 수십 KB 라 지금은 청소하지 않는다.
 *
 * <p>웹은 `.web.ts` — 브라우저는 Lottie 를 그리지 않고 썸네일만 쓴다(components/AnimatedSticker 주석).
 */
import type { AnimationObject } from 'lottie-react-native';
import { Directory, File, Paths } from 'expo-file-system';

const DIR_NAME = 'remote-stickers';
/** 파싱까지 끝낸 것 — 같은 스티커가 대화에 여러 번 나와도 한 번만 읽는다 */
const memory = new Map<string, AnimationObject>();
const inflight = new Map<string, Promise<AnimationObject>>();

function fileNameOf(url: string): string {
  return url.split('/').pop()!.split('?')[0];
}

function dir(): Directory {
  const d = new Directory(Paths.document, DIR_NAME);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

/** 메모리에 이미 있으면 동기로 준다 — 첫 렌더에서 썸네일이 스쳤다 바뀌지 않게 */
export function cachedRemoteLottie(url: string): AnimationObject | undefined {
  return memory.get(url);
}

/** 기기에 있으면 읽고, 없으면 받아 저장한 뒤 준다 */
export function loadRemoteLottie(url: string): Promise<AnimationObject> {
  const hit = memory.get(url);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(url);
  if (pending) return pending;

  const job = (async () => {
    const file = new File(dir(), fileNameOf(url));
    let text: string;
    if (file.exists) {
      text = await file.text();
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`sticker ${res.status}`);
      text = await res.text();
      // 받은 내용이 JSON 이 아니면(프록시 오류 페이지 등) 저장하지 않는다 — 다음에 다시 받는다
      JSON.parse(text);
      file.create({ overwrite: true });
      file.write(text);
    }
    const parsed = JSON.parse(text) as AnimationObject;
    memory.set(url, parsed);
    return parsed;
  })().finally(() => inflight.delete(url));

  inflight.set(url, job);
  return job;
}
