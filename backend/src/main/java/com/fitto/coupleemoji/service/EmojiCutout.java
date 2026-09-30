package com.fitto.coupleemoji.service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Optional;

/**
 * 우리 이모지 배경 따내기 — 흰 배경 JPEG → 투명 PNG(흰 스티커 테두리 포함). docs/COUPLE_EMOJI_CUTOUT_2026-09-30.md.
 *
 * <p>생성 모델 출력에는 알파가 없어 흰 배경이 딸려 온다. 그래서 채팅이 흰 원판에 얹어 그렸는데, 배경 없이 그림만 뜨는
 * 캐릭터 스티커와 섞이면 무거워 보였다(비트윈 비교, 2026-09-30).
 *
 * <p><b>흰색을 지우지 않는다 — 실루엣을 만든다.</b> 처음엔 가장자리에서 이어진 흰색을 지웠는데, 흰 스티커 외곽선과
 * 흰 옷 사이에 선이 없는 곳으로 번져 셔츠가 뚫렸다. 대신:
 * <ol>
 *   <li>흰색이 아닌 화소(선·색)를 그림 재료로 본다</li>
 *   <li>닫힘(팽창 → 침식)으로 선 사이 틈을 막는다 — 흰 옷의 옅은 윤곽선 틈까지</li>
 *   <li>위·왼쪽·오른쪽 변에서 들어오는 빈 곳만 바깥이다. 아래 변은 흉상이 잘려 나가는 자리라 막는다</li>
 *   <li>실루엣을 스티커 테두리 두께만큼 넓혀 원래 흰 외곽선 자리를 고르게 다시 두른다</li>
 *   <li>가장자리를 살짝 흐려 알파로 쓴다</li>
 * </ol>
 * 실제 생성 이미지 12장으로 맞춘 값이다(흰 셔츠·색종이·안경·모자 포함).
 */
public final class EmojiCutout {

    /** 이보다 어두운 채널이 있으면 그림 재료 */
    static final int INK_BELOW = 236;
    /** 채도(최대-최소)가 이보다 크면 밝아도 그림 재료(파스텔 모자 등) */
    static final int INK_SPREAD = 24;
    /** 틈 막기 창 크기(1024 기준) */
    static final int CLOSE = 25;
    /** 스티커 흰 테두리 두께(1024 기준) */
    static final int BORDER = 15;
    /** 바깥 비율이 이 범위를 벗어나면 따내기 실패로 본다(거의 다 지워졌거나 거의 안 지워짐) */
    static final double MIN_OUTSIDE = 0.12;
    static final double MAX_OUTSIDE = 0.88;

    private EmojiCutout() {
    }

    /**
     * @return 투명 배경 PNG. 읽을 수 없거나 결과가 수상하면 비어 있다 — 호출부는 원본을 그대로 쓴다
     */
    public static Optional<byte[]> cut(byte[] source) {
        BufferedImage img;
        try {
            img = ImageIO.read(new ByteArrayInputStream(source));
        } catch (IOException e) {
            return Optional.empty();
        }
        if (img == null) return Optional.empty();
        int w = img.getWidth();
        int h = img.getHeight();
        if (w < 64 || h < 64) return Optional.empty();
        double k = w / 1024.0;

        int[] rgb = img.getRGB(0, 0, w, h, null, 0, w);
        boolean[] ink = new boolean[w * h];
        for (int i = 0; i < rgb.length; i++) {
            int p = rgb[i];
            int r = (p >> 16) & 0xff, g = (p >> 8) & 0xff, b = p & 0xff;
            int lo = Math.min(r, Math.min(g, b));
            int hi = Math.max(r, Math.max(g, b));
            ink[i] = lo < INK_BELOW || hi - lo > INK_SPREAD;
        }

        int close = odd(CLOSE * k);
        boolean[] closed = erode(dilate(ink, w, h, close), w, h, close);

        boolean[] outside = floodOutside(closed, w, h);
        int outCount = 0;
        for (boolean o : outside) if (o) outCount++;
        double frac = outCount / (double) outside.length;
        if (frac < MIN_OUTSIDE || frac > MAX_OUTSIDE) return Optional.empty();

        boolean[] sil = new boolean[w * h];
        for (int i = 0; i < sil.length; i++) sil[i] = !outside[i];
        boolean[] sticker = dilate(sil, w, h, odd(BORDER * k * 2));

        int[] alpha = new int[w * h];
        for (int i = 0; i < alpha.length; i++) alpha[i] = sticker[i] ? 255 : 0;
        int blur = Math.max(1, (int) Math.round(1.2 * k));
        alpha = boxBlur(boxBlur(alpha, w, h, blur), w, h, blur);

        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        int[] argb = new int[w * h];
        for (int i = 0; i < argb.length; i++) argb[i] = (alpha[i] << 24) | (rgb[i] & 0xffffff);
        out.setRGB(0, 0, w, h, argb, 0, w);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try {
            if (!ImageIO.write(out, "png", bytes)) return Optional.empty();
        } catch (IOException e) {
            return Optional.empty();
        }
        return Optional.of(bytes.toByteArray());
    }

    static int odd(double n) {
        int v = Math.max(3, (int) Math.round(n));
        return v % 2 == 1 ? v : v + 1;
    }

    /** 바깥 = 위·왼쪽·오른쪽 변에서 재료가 아닌 칸을 따라 들어온 곳 */
    static boolean[] floodOutside(boolean[] mask, int w, int h) {
        boolean[] out = new boolean[w * h];
        ArrayDeque<Integer> q = new ArrayDeque<>();
        for (int x = 0; x < w; x++) seed(mask, out, q, x);                       // 위 변
        for (int y = 0; y < h; y++) {
            seed(mask, out, q, y * w);                                          // 왼쪽 변
            seed(mask, out, q, y * w + w - 1);                                  // 오른쪽 변
        }
        while (!q.isEmpty()) {
            int i = q.poll();
            int x = i % w, y = i / w;
            if (x > 0) seed(mask, out, q, i - 1);
            if (x < w - 1) seed(mask, out, q, i + 1);
            if (y > 0) seed(mask, out, q, i - w);
            if (y < h - 1) seed(mask, out, q, i + w);
        }
        return out;
    }

    private static void seed(boolean[] mask, boolean[] out, ArrayDeque<Integer> q, int i) {
        if (!mask[i] && !out[i]) {
            out[i] = true;
            q.add(i);
        }
    }

    /** 정사각 창 팽창 — 가로·세로 두 번의 구간 합(창 안에 하나라도 있으면 참) */
    static boolean[] dilate(boolean[] m, int w, int h, int size) {
        return pass(pass(m, w, h, size, true, false), w, h, size, false, false);
    }

    /** 정사각 창 침식 — 창 안이 전부 참이어야 참. 판 밖은 참으로 본다(가장자리가 깎이지 않게) */
    static boolean[] erode(boolean[] m, int w, int h, int size) {
        return pass(pass(m, w, h, size, true, true), w, h, size, false, true);
    }

    private static boolean[] pass(boolean[] m, int w, int h, int size, boolean horizontal, boolean all) {
        int r = size / 2;
        boolean[] out = new boolean[w * h];
        int lines = horizontal ? h : w;
        int len = horizontal ? w : h;
        int[] prefix = new int[len + 1];
        for (int line = 0; line < lines; line++) {
            for (int t = 0; t < len; t++) {
                int i = horizontal ? line * w + t : t * w + line;
                prefix[t + 1] = prefix[t] + (m[i] ? 1 : 0);
            }
            for (int t = 0; t < len; t++) {
                int a = Math.max(0, t - r), b = Math.min(len - 1, t + r);
                int count = prefix[b + 1] - prefix[a];
                int i = horizontal ? line * w + t : t * w + line;
                // 침식: 판 밖 칸은 참으로 친다 → 창에 들어온 칸이 전부 참이면 참
                out[i] = all ? count == (b - a + 1) : count > 0;
            }
        }
        return out;
    }

    /** 상자 흐림(가로·세로) — 알파 가장자리 부드럽게 */
    static int[] boxBlur(int[] v, int w, int h, int r) {
        int[] tmp = new int[w * h];
        int[] out = new int[w * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int s = 0, n = 0;
                for (int d = -r; d <= r; d++) {
                    int xx = x + d;
                    if (xx < 0 || xx >= w) continue;
                    s += v[y * w + xx];
                    n++;
                }
                tmp[y * w + x] = s / n;
            }
        }
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int s = 0, n = 0;
                for (int d = -r; d <= r; d++) {
                    int yy = y + d;
                    if (yy < 0 || yy >= h) continue;
                    s += tmp[yy * w + x];
                    n++;
                }
                out[y * w + x] = s / n;
            }
        }
        return out;
    }
}
