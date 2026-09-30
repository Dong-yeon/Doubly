package com.fitto.coupleemoji;

import com.fitto.coupleemoji.service.EmojiCutout;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 배경 따내기 규칙 — 실제 생성 이미지에서 부딪힌 경우를 합성 그림으로 고정한다(docs/COUPLE_EMOJI_CUTOUT_2026-09-30.md).
 *
 * <p>그림: 흰 배경 위 검은 원 외곽선(얼굴) 안은 흰색, 그 아래 아래 변까지 내려가는 흰 셔츠(양옆만 검은 선).
 * 처음 구현(가장자리에서 이어진 흰색 지우기)은 셔츠 속으로 번졌다 — 그게 이 테스트가 막는 회귀다.
 */
class EmojiCutoutTest {

    private static final int S = 512;

    private static byte[] jpeg(BufferedImage img) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", out);
        return out.toByteArray();
    }

    private static BufferedImage sample() {
        BufferedImage img = new BufferedImage(S, S, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, S, S);
        g.setColor(new Color(30, 30, 30));
        g.setStroke(new BasicStroke(6));
        g.drawOval(156, 60, 200, 200);                 // 얼굴 외곽선 — 속은 흰색
        g.drawLine(176, 300, 176, S);                   // 셔츠 양옆 선 — 아래 변까지 내려간다(흉상)
        g.drawLine(336, 300, 336, S);
        g.drawLine(176, 300, 336, 300);
        g.setColor(new Color(220, 60, 60));
        g.fillOval(246, 150, 20, 20);                   // 코
        g.dispose();
        return img;
    }

    private static int alpha(BufferedImage img, int x, int y) {
        return (img.getRGB(x, y) >>> 24) & 0xff;
    }

    @Test
    void 배경은_투명하고_선_안쪽의_흰색과_흉상_셔츠는_남는다() throws Exception {
        Optional<byte[]> out = EmojiCutout.cut(jpeg(sample()));
        assertTrue(out.isPresent());
        BufferedImage png = ImageIO.read(new ByteArrayInputStream(out.get()));

        assertEquals(0, alpha(png, 5, 5), "모서리 배경은 투명");
        assertEquals(0, alpha(png, 40, 300), "옆 배경은 투명");
        assertEquals(255, alpha(png, 200, 160), "얼굴 속 흰색은 남는다");
        assertEquals(255, alpha(png, 256, 480), "아래 변까지 내려간 흰 셔츠는 남는다");
        assertEquals(255, alpha(png, 150, 160), "외곽선 바로 바깥은 흰 스티커 테두리");
    }

    @Test
    void 거의_전부_흰색이면_따내지_않는다() throws Exception {
        BufferedImage blank = new BufferedImage(S, S, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = blank.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, S, S);
        g.dispose();

        assertTrue(EmojiCutout.cut(jpeg(blank)).isEmpty(), "지울 게 거의 전부면 수상하다 — 원본을 쓴다");
    }

    @Test
    void 이미지가_아니면_비어_있다() {
        assertTrue(EmojiCutout.cut(new byte[]{1, 2, 3}).isEmpty());
    }
}
