package com.fitto.diet;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.service.FoodDbClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 바코드 조회 — 키 미설정(테스트 프로파일 기본 상태) 시 조용히 비활성되는지 확인.
 * Gemini(AI_NOT_CONFIGURED)와 같은 패턴 — {@code TripFlowTest} 참고.
 */
@SpringBootTest
@ActiveProfiles("test")
class FoodDbNotConfiguredTest {

    @Autowired
    FoodDbClient foodDbClient;

    @Test
    void 키가_없으면_설정_안됨으로_판정된다() {
        assertThat(foodDbClient.isConfigured()).isFalse();
    }

    @Test
    void 키가_없으면_조회_시_명확한_에러를_던진다() {
        assertThatThrownBy(() -> foodDbClient.lookup("8801234567890"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FOOD_DB_NOT_CONFIGURED);
    }

    /**
     * 경로에 넣을 수 없는 모양의 키(공공데이터포털 base64 서비스키)는 있어도 없는 것과 같다 —
     * 매 조회마다 확정 실패할 HTTP 를 보내지 않는다.
     */
    @Test
    void 경로에_못_넣는_키는_미설정과_같게_다룬다() {
        var props = new com.fitto.common.config.FoodDbProperties();
        props.setApiKey("JL9aMaP%2F1Grqpl0VTVhfvEmoNrGW49U9bfcx%3D%3D");
        var client = new FoodDbClient(props);

        assertThat(client.isConfigured()).isFalse();
        assertThatThrownBy(() -> client.search("신라면"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FOOD_DB_NOT_CONFIGURED);
    }

    @Test
    void 키가_없으면_이름_검색_시에도_명확한_에러를_던진다() {
        assertThatThrownBy(() -> foodDbClient.search("단백질쉐이크"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FOOD_DB_NOT_CONFIGURED);
    }
}
