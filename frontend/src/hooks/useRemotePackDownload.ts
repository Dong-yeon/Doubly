/**
 * 서버 팩 받기 — 이모티콘 설정과 상점의 팩 상세가 같은 흐름을 쓴다(2026-10-12).
 *
 * <p>받는 중에는 팩 키별로 받은 개수를 들고 있다가, 끝나면 "받음"으로 표시해 패널에 세운다.
 * 반만 받아도 받음으로 친다 — 못 받은 장은 처음 보낼 때·받을 때 다시 받는다(remoteStickerFiles).
 */
import { useCallback, useState } from 'react';
import { useStickerPrefsStore } from '../store/stickerPrefsStore';
import { toast } from '../store/toastStore';
import { downloadRemoteLotties } from '../utils/remoteStickerFiles';
import type { ManagedPack } from '../utils/stickerPackList';

export function useRemotePackDownload() {
  const markDownloaded = useStickerPrefsStore((s) => s.markDownloaded);
  /** 받는 중인 팩 → 받은 개수 */
  const [progress, setProgress] = useState<Record<string, number>>({});

  const download = useCallback(
    async (p: ManagedPack, label: string) => {
      setProgress((s) => ({ ...s, [p.key]: 0 }));
      const ok = await downloadRemoteLotties(p.urls, (done) => setProgress((s) => ({ ...s, [p.key]: done })));
      setProgress((s) => {
        const next = { ...s };
        delete next[p.key];
        return next;
      });
      markDownloaded(p.key, true);
      if (ok < p.urls.length) {
        toast.info(`${label} — ${p.urls.length - ok}개는 나중에 받아요`);
      } else {
        toast.success(`${label} 받았어요`);
      }
    },
    [markDownloaded],
  );

  return { progress, download };
}
