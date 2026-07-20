package com.fitto.trip;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.trip.dto.ChecklistItemResponse;
import com.fitto.trip.dto.ChecklistResponse;
import com.fitto.trip.dto.SaveChecklistItemRequest;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.service.TripChecklistService;
import com.fitto.trip.service.TripService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 커플 여행 준비물 체크리스트 통합 플로우 (PLAN.md Trip Checklist) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class TripChecklistFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    TripService tripService;
    @Autowired
    TripChecklistService checklistService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
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

    private SaveChecklistItemRequest item(String content) {
        return new SaveChecklistItemRequest(content);
    }

    @Test
    void 준비물을_추가하면_목록과_진행개수에_반영된다() {
        long[] c = couple("cl1@fitto.com", "cl2@fitto.com");
        Long tripId = trip(c[0]);
        checklistService.add(c[0], tripId, item("여권"));
        checklistService.add(c[1], tripId, item("선크림")); // 상대도 추가 가능

        ChecklistResponse res = checklistService.list(c[0], tripId);
        assertThat(res.total()).isEqualTo(2);
        assertThat(res.checkedCount()).isZero();
        assertThat(res.items()).extracting(ChecklistItemResponse::content)
                .containsExactly("여권", "선크림");
    }

    @Test
    void 체크_토글은_체크한_사람을_기록하고_해제하면_비운다() {
        long[] c = couple("cl3@fitto.com", "cl4@fitto.com");
        Long tripId = trip(c[0]);
        ChecklistItemResponse added = checklistService.add(c[0], tripId, item("여권"));

        ChecklistItemResponse checked = checklistService.toggle(c[1], tripId, added.id());
        assertThat(checked.checked()).isTrue();
        assertThat(checked.checkedBy()).isEqualTo(c[1]);
        assertThat(checklistService.list(c[0], tripId).checkedCount()).isEqualTo(1);

        ChecklistItemResponse unchecked = checklistService.toggle(c[0], tripId, added.id());
        assertThat(unchecked.checked()).isFalse();
        assertThat(unchecked.checkedBy()).isNull();
        assertThat(checklistService.list(c[0], tripId).checkedCount()).isZero();
    }

    @Test
    void 이름_수정과_삭제가_반영된다() {
        long[] c = couple("cl5@fitto.com", "cl6@fitto.com");
        Long tripId = trip(c[0]);
        ChecklistItemResponse added = checklistService.add(c[0], tripId, item("우산"));

        ChecklistItemResponse renamed = checklistService.rename(c[1], tripId, added.id(), item("접이식 우산"));
        assertThat(renamed.content()).isEqualTo("접이식 우산");

        checklistService.delete(c[0], tripId, added.id());
        assertThat(checklistService.list(c[0], tripId).total()).isZero();
    }

    @Test
    void 다른_커플의_체크리스트는_볼_수_없다() {
        long[] c1 = couple("cl7@fitto.com", "cl8@fitto.com");
        long[] c2 = couple("cl9@fitto.com", "cl10@fitto.com");
        Long tripId = trip(c1[0]);

        assertThatThrownBy(() -> checklistService.list(c2[0], tripId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }
}
