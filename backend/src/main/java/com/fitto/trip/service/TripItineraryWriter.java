package com.fitto.trip.service;

import com.fitto.trip.domain.TripItem;
import com.fitto.trip.repository.TripItemRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * AI 일정 생성의 <b>쓰기 단계만</b> 담는 협력자 — 기존 일정을 지우고 새 일정을 넣는다.
 *
 * <p><b>왜 별도 빈인가</b>: {@link TripService#generateItinerary} 는 Gemini 응답을 최대 60초
 * 기다리므로 트랜잭션 없이 돌아야 한다(커넥션을 쥔 채 외부 호출을 기다리면 Hikari 풀이 고갈되고
 * AI 와 무관한 요청까지 죽는다 — {@code DietCoachService} 클래스 주석 참고).
 * 하지만 DELETE + INSERT 두 단계는 <b>반드시 원자적</b>이어야 한다. 중간에 실패하면 사용자의
 * 기존 일정만 사라진 채로 남기 때문이다.
 *
 * <p>같은 빈 안에서 {@code @Transactional} 메서드를 호출하면 프록시를 타지 않아 트랜잭션이
 * 걸리지 않는다(self-invocation). 그래서 "트랜잭션 없는 긴 구간"과 "짧은 원자적 쓰기"를
 * 서로 다른 빈으로 갈라 둔다.
 */
@Component
public class TripItineraryWriter {

    private final TripItemRepository tripItemRepository;

    public TripItineraryWriter(TripItemRepository tripItemRepository) {
        this.tripItemRepository = tripItemRepository;
    }

    /** 여행의 일정 전체를 {@code items} 로 대체한다 — 삭제와 저장이 한 트랜잭션이다. */
    @Transactional
    public void replaceItems(Long tripId, List<TripItem> items) {
        tripItemRepository.deleteByTripId(tripId); // 기존 일정 대체 (벌크 DELETE 후 INSERT)
        tripItemRepository.saveAll(items);
    }
}
