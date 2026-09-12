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
 * 식품 DB — 키 미설정(테스트 프로파일 기본 상태) 시 조용히 비활성되는지 확인.
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
    void 키가_없으면_이름_검색_시_명확한_에러를_던진다() {
        assertThatThrownBy(() -> foodDbClient.search("신라면"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FOOD_DB_NOT_CONFIGURED);
    }

    /**
     * 바코드 조회는 키가 있어도 지원하지 않는다 — 현재 데이터셋에 바코드 필드가 없다.
     * 조회 실패를 "등록되지 않은 바코드"로 번역하던 예전 동작을 되돌리지 않기 위해 못박아 둔다.
     */
    @Test
    void 바코드_조회는_준비되지_않았다고_알린다() {
        assertThatThrownBy(() -> foodDbClient.lookup("8801234567890"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FOOD_DB_NOT_CONFIGURED);
    }
}
