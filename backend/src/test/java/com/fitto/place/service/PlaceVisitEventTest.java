package com.fitto.place.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.plan.PlanGuard;
import com.fitto.diet.repository.MealRepository;
import com.fitto.feed.repository.FeedReactionRepository;
import com.fitto.place.domain.Place;
import com.fitto.place.domain.PlaceVisit;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.repository.PlaceRatingRepository;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 방문 기록이 바뀌면 상대 앱에 {@code PLACE} 이벤트가 간다 — 열린 캘린더의 "다녀온 곳"이 다시 받는다.
 *
 * <p>스프링 없이 조립한다. 실시간 이벤트를 보려고 {@code CoupleEventPublisher} 를 {@code @MockitoBean}
 * 으로 바꾸면 컨텍스트가 하나 더 생겨 JVM 끝까지 캐시된다(CLAUDE.md — 2026-09-22 CI OOM).
 * 확인할 것은 "언제 보내는가"뿐이라 트랜잭션 동기화를 직접 켜서 커밋 전후를 가른다.
 */
class PlaceVisitEventTest {

    private static final long USER = 1L;
    private static final long PARTNER = 2L;
    private static final long COUPLE = 7L;
    private static final long PLACE_ID = 30L;
    private static final long VISIT_ID = 40L;

    private final PlaceRepository placeRepository = mock(PlaceRepository.class);
    private final PlaceVisitRepository placeVisitRepository = mock(PlaceVisitRepository.class);
    private final RelationRepository relationRepository = mock(RelationRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final CoupleEventPublisher publisher = mock(CoupleEventPublisher.class);

    private final PlaceService service = new PlaceService(placeRepository, placeVisitRepository,
            mock(PlaceRatingRepository.class), relationRepository, userRepository, mock(MealRepository.class),
            mock(NotificationService.class), mock(PlanGuard.class), mock(FeedReactionRepository.class),
            mock(KakaoLocalClient.class), mock(PlatformTransactionManager.class), publisher);

    @BeforeEach
    void setUp() {
        Place place = mock(Place.class);
        when(place.getId()).thenReturn(PLACE_ID);
        when(place.getCoupleId()).thenReturn(COUPLE);
        when(place.getName()).thenReturn("트라토리아");
        when(placeRepository.findById(PLACE_ID)).thenReturn(Optional.of(place));

        Relation couple = mock(Relation.class);
        when(couple.getId()).thenReturn(COUPLE);
        when(couple.partnerOf(USER)).thenReturn(PARTNER);
        when(relationRepository.findByUserAndTypeAndStatus(anyLong(), any(), any())).thenReturn(List.of(couple));
        when(userRepository.findById(anyLong())).thenReturn(Optional.empty());

        PlaceVisit visit = mock(PlaceVisit.class);
        when(visit.getPlaceId()).thenReturn(PLACE_ID);
        when(visit.getVisitedBy()).thenReturn(USER);
        when(placeVisitRepository.findById(VISIT_ID)).thenReturn(Optional.of(visit));
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void 방문을_기록하면_커밋_뒤에_PLACE_이벤트를_보낸다() {
        TransactionSynchronizationManager.initSynchronization();

        service.recordVisit(USER, PLACE_ID, new RecordVisitRequest(LocalDate.now(), 5, null, null, null));

        // 커밋 전에 보내면 상대 앱이 다시 조회해도 방금 남긴 방문이 아직 안 보인다
        verify(publisher, never()).publish(anyLong(), any());
        commit();
        verify(publisher).publish(COUPLE, CoupleEvent.PLACE);
    }

    @Test
    void 방문을_지우면_커밋_뒤에_PLACE_이벤트를_보낸다() {
        TransactionSynchronizationManager.initSynchronization();

        service.deleteVisit(USER, PLACE_ID, VISIT_ID);

        verify(publisher, never()).publish(anyLong(), any());
        commit();
        verify(publisher).publish(COUPLE, CoupleEvent.PLACE);
    }

    /** 트랜잭션 밖(테스트·배치)이면 기다릴 커밋이 없다 — 바로 보낸다. */
    @Test
    void 트랜잭션_밖이면_바로_보낸다() {
        service.recordVisit(USER, PLACE_ID, new RecordVisitRequest(LocalDate.now(), null, null, null, null));

        verify(publisher).publish(COUPLE, CoupleEvent.PLACE);
    }

    private static void commit() {
        List<TransactionSynchronization> syncs = TransactionSynchronizationManager.getSynchronizations();
        syncs.forEach(TransactionSynchronization::afterCommit);
    }
}
