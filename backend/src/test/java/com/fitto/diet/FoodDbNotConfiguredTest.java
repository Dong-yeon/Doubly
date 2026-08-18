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
}
