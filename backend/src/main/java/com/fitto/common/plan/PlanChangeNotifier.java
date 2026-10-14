package com.fitto.common.plan;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import org.springframework.stereotype.Component;

/**
 * 결제로 광고 제거가 바뀌었음을 상대 화면에 알린다 — 광고 제거는 커플 한 명이 사면 둘 다라서
 * ({@link AdFreeResolver}), 상대 앱이 앱을 다시 켤 때까지 광고를 띄우면 "샀는데 왜 광고가 나오냐"가 된다.
 * 커플이 없으면 아무것도 하지 않는다(본인 앱은 검증 응답으로 이미 안다).
 */
@Component
public class PlanChangeNotifier {

    private final PlanResolver planResolver;
    private final CoupleEventPublisher publisher;

    public PlanChangeNotifier(PlanResolver planResolver, CoupleEventPublisher publisher) {
        this.planResolver = planResolver;
        this.publisher = publisher;
    }

    public void notifyCouple(Long userId) {
        if (userId == null) {
            return;
        }
        planResolver.activeCoupleIdOf(userId).ifPresent(relationId -> publisher.publish(relationId, CoupleEvent.PLAN));
    }
}
