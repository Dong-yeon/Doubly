package com.fitto.common.plan;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 읽기 전용 트랜잭션 안에서 불러도 크레딧이 <b>실제로</b> 줄어든다.
 *
 * <p>회귀 방지: 우리 이모지 서비스는 클래스 기본값이 읽기 전용 트랜잭션이라, 생성 접수({@code prepare})에서 부른
 * {@code consumeOne} 이 그 트랜잭션에 합류했다. Hibernate 는 읽기 전용에서 flush 하지 않으므로 {@code true} 를
 * 돌려주고도 {@code used} 가 0 그대로였다 — 산 세트가 한 번도 차감되지 않았다(2026-10-13 발견).
 */
@SpringBootTest
@ActiveProfiles("test")
class FeatureCreditReadOnlyTest {

    @Autowired AuthService authService;
    @Autowired FeatureCreditService creditService;
    @Autowired FeatureCreditRepository repository;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void 읽기_전용_트랜잭션_안에서_써도_차감이_남는다() {
        Long user = authService.register(
                new RegisterRequest("credit-ro@fitto.com", "password123", "U", null, null, true, true, false),
                "127.0.0.1").user().id();
        repository.save(FeatureCredit.builder().userId(user).feature(Feature.AI_COUPLE_EMOJI)
                .store(Store.MANUAL).productId("emoji_set_1").transactionId("ro-1").credits(1).build());

        TransactionTemplate readOnly = new TransactionTemplate(transactionManager);
        readOnly.setReadOnly(true);
        Boolean consumed = readOnly.execute(s -> creditService.consumeOne(user, Feature.AI_COUPLE_EMOJI));

        assertThat(consumed).isTrue();
        assertThat(repository.findByTransactionId("ro-1").orElseThrow().getUsed()).isEqualTo(1);
        assertThat(creditService.remaining(user, Feature.AI_COUPLE_EMOJI)).isZero();

        // 되돌리기도 같은 함정을 지난다
        readOnly.executeWithoutResult(s -> creditService.refundOne(user, Feature.AI_COUPLE_EMOJI));
        assertThat(repository.findByTransactionId("ro-1").orElseThrow().getUsed()).isZero();
    }
}
