package com.fitto.diet.service;

import org.junit.jupiter.api.Test;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Cloudinary 다운로드 URL에 변환 세그먼트({@code w_1024,c_limit,q_auto})를 끼워 넣는 로직.
 * 스프링 컨텍스트 없는 순수 단위 테스트 — {@link FoodAnalysisTextPromptTest} 와 같은 패턴.
 *
 * <p>회귀 방지: 세그먼트 위치가 하나라도 틀리면(예: /upload/ 앞에 끼운다거나) Cloudinary 가
 * 404 를 돌려주는데, 그 실패가 여기(단위 테스트)가 아니라 운영에서 사진 분석이 전부
 * 깨지는 형태로 나타난다.
 */
class FoodAnalysisCloudinaryTransformTest {

    private final FoodAnalysisService service = new FoodAnalysisService(null);

    @Test
    void upload_바로_뒤에_변환_세그먼트가_들어간다() {
        URI original = URI.create("https://res.cloudinary.com/demo/image/upload/v1700000000/doubly/meals/abc.jpg");

        URI transformed = service.withTransform(original);

        assertThat(transformed.toString()).isEqualTo(
                "https://res.cloudinary.com/demo/image/upload/w_1024,c_limit,q_auto/v1700000000/doubly/meals/abc.jpg");
    }

    @Test
    void 버전_세그먼트가_없어도_동작한다() {
        URI original = URI.create("https://res.cloudinary.com/demo/image/upload/doubly/meals/abc.jpg");

        URI transformed = service.withTransform(original);

        assertThat(transformed.toString()).isEqualTo(
                "https://res.cloudinary.com/demo/image/upload/w_1024,c_limit,q_auto/doubly/meals/abc.jpg");
    }

    @Test
    void upload_세그먼트가_없으면_원본을_그대로_돌려준다() {
        URI original = URI.create("https://res.cloudinary.com/demo/some/other/shape.jpg");

        URI transformed = service.withTransform(original);

        assertThat(transformed).isEqualTo(original);
    }

    @Test
    void 쿼리스트링은_보존된다() {
        URI original = URI.create("https://res.cloudinary.com/demo/image/upload/v1/abc.jpg?foo=bar");

        URI transformed = service.withTransform(original);

        assertThat(transformed.toString()).isEqualTo(
                "https://res.cloudinary.com/demo/image/upload/w_1024,c_limit,q_auto/v1/abc.jpg?foo=bar");
    }
}
