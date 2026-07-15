package com.fitto.trip;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.trip.dto.SaveTripExpenseRequest;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.dto.TripExpensesResponse;
import com.fitto.trip.dto.TripExpensesResponse.Settlement;
import com.fitto.trip.dto.TripResponse;
import com.fitto.trip.service.TripExpenseService;
import com.fitto.trip.service.TripService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 커플 여행 경비 정산 통합 플로우 (PLAN.md Trip Expenses) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class TripExpenseFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    TripService tripService;
    @Autowired
    TripExpenseService tripExpenseService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null), "127.0.0.1").user().id();
    }

    private long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    private Long trip(Long userId) {
        return tripService.save(userId, new SaveTripRequest("제주도 2박 3일",
                LocalDate.now().plusDays(30), LocalDate.now().plusDays(32), null, null)).id();
    }

    private SaveTripExpenseRequest expense(BigDecimal amount, Long paidBy) {
        return new SaveTripExpenseRequest(amount, paidBy, null, "식비", 1, null);
    }

    @Test
    void 경비를_추가하면_합계와_각자_지출에_반영된다() {
        long[] c = couple("ex1@fitto.com", "ex2@fitto.com");
        Long tripId = trip(c[0]);
        tripExpenseService.add(c[0], tripId, expense(new BigDecimal("30000"), null)); // A 지출
        tripExpenseService.add(c[1], tripId, expense(new BigDecimal("10000"), null)); // B 지출

        TripExpensesResponse res = tripExpenseService.list(c[0], tripId);
        assertThat(res.expenses()).hasSize(2);
        assertThat(res.total()).isEqualByComparingTo("40000");
        assertThat(res.myPaid()).isEqualByComparingTo("30000");
        assertThat(res.partnerPaid()).isEqualByComparingTo("10000");
    }

    @Test
    void 정산은_더_낸_쪽이_절반_차액을_받는다() {
        long[] c = couple("ex3@fitto.com", "ex4@fitto.com");
        Long tripId = trip(c[0]);
        tripExpenseService.add(c[0], tripId, expense(new BigDecimal("30000"), null));
        tripExpenseService.add(c[1], tripId, expense(new BigDecimal("10000"), null));

        // A 관점: 내가 20000 더 냄 → 상대가 나에게 10000
        Settlement fromA = tripExpenseService.list(c[0], tripId).settlement();
        assertThat(fromA.direction()).isEqualTo(Settlement.PARTNER_OWES_ME);
        assertThat(fromA.amount()).isEqualByComparingTo("10000");

        // B 관점: 반대 방향, 같은 금액
        Settlement fromB = tripExpenseService.list(c[1], tripId).settlement();
        assertThat(fromB.direction()).isEqualTo(Settlement.I_OWE_PARTNER);
        assertThat(fromB.amount()).isEqualByComparingTo("10000");
    }

    @Test
    void 반반으로_냈으면_정산_완료다() {
        long[] c = couple("ex5@fitto.com", "ex6@fitto.com");
        Long tripId = trip(c[0]);
        tripExpenseService.add(c[0], tripId, expense(new BigDecimal("20000"), null));
        tripExpenseService.add(c[1], tripId, expense(new BigDecimal("20000"), null));

        Settlement s = tripExpenseService.list(c[0], tripId).settlement();
        assertThat(s.direction()).isEqualTo(Settlement.SETTLED);
        assertThat(s.amount()).isEqualByComparingTo("0");
    }

    @Test
    void 커플_두_사람이_아닌_사람을_낸사람으로_지정할_수_없다() {
        long[] c = couple("ex7@fitto.com", "ex8@fitto.com");
        Long outsider = register("ex9@fitto.com");
        Long tripId = trip(c[0]);

        assertThatThrownBy(() -> tripExpenseService.add(c[0], tripId,
                expense(new BigDecimal("5000"), outsider)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    void 여행_기간을_벗어난_며칠차는_넣을_수_없다() {
        long[] c = couple("ex10@fitto.com", "ex11@fitto.com");
        Long tripId = trip(c[0]); // 3일치

        assertThatThrownBy(() -> tripExpenseService.add(c[0], tripId,
                new SaveTripExpenseRequest(new BigDecimal("5000"), null, null, null, 4, null)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    void 다른_커플의_경비는_볼_수_없다() {
        long[] c1 = couple("ex12@fitto.com", "ex13@fitto.com");
        long[] c2 = couple("ex14@fitto.com", "ex15@fitto.com");
        Long tripId = trip(c1[0]);

        assertThatThrownBy(() -> tripExpenseService.list(c2[0], tripId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }
}
