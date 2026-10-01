package com.fitto.sticker.config;

import com.fitto.sticker.service.RemoteStickerCatalog;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.time.Duration;

/**
 * 서버 배포 스티커 파일을 {@code /sticker-assets/**} 로 공개한다({@link RemoteStickerCatalog}).
 *
 * <p><b>인증 없이 연다</b>(SecurityConfig). 썸네일은 expo-image 가 헤더 없이 받아 가고, 내용은
 * 공개 라이선스 그림이라 숨길 것이 없다. 무엇을 보낼 수 있는지의 판정은 여전히 메시지 전송 때
 * 서버가 한다 — 파일을 받는 것과 쓰는 것은 다른 문제다.
 *
 * <p><b>1년 immutable</b>: 파일 이름에 내용 해시가 있어 같은 이름이면 같은 바이트다. CDN 으로 옮길
 * 때도 카탈로그의 경로만 바꾸면 되고 앱은 손대지 않는다.
 */
@Configuration
public class StickerAssetConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler(RemoteStickerCatalog.ASSET_URL_PREFIX + "**")
                .addResourceLocations("classpath:/sticker-assets/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
    }
}
