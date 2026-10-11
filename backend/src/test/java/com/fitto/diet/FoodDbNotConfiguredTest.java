package com.fitto.diet;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.service.BarcodeLookupService;
import com.fitto.diet.service.FoodDbClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 식품 DB — 키 미설정(테스트 프로파일 기본 상태) 시 조용히 비활성되는지 확인.
 * Gemini(AI_NOT_CONFIGURED)와 같은 패턴 — {@code TripFlowTest} 참고.
 */
@SpringBootTest
@ActiveProfiles("test")
class FoodDbNotConfiguredTest {

    @Autowired
    FoodDbClient foodDbClient;
    @Autowired
    BarcodeLookupService barcodeLookupService;

    @Test
    void 키가_없으면_설정_안됨으로_판정된다() {
        assertThat(foodDbClient.isConfigured()).isFalse();
    }

    @Test
    void 키가_없으면_이름_검색_시_명확한_에러를_던진다() {
        assertThatThrownBy(() -> foodDbClient.search("신라면"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FOOD_DB_NOT_CONFIGURED);
    }

    /**
     * 테스트 프로파일은 식품안전나라 키가 없고 Open Food Facts 도 꺼 두었다 — 바코드 출처가 하나도 없으면
     * "준비되지 않았다"고 말한다. 출처가 있는데 못 찾은 경우(FOOD_DB_NOT_FOUND)와 섞지 않는다.
     */
    @Test
    void 바코드_출처가_하나도_없으면_준비되지_않았다고_알린다() {
        assertThatThrownBy(() -> barcodeLookupService.lookup("8801234567890"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FOOD_DB_NOT_CONFIGURED);
    }
}
