package com.fitto.place.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.time.KstClock;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.repository.MealRepository;
import com.fitto.diet.service.MealService;
import com.fitto.place.domain.Place;
import com.fitto.place.domain.PlaceVisit;
import com.fitto.place.dto.MealVisitResponse;
import com.fitto.place.dto.PlaceResponse;
import com.fitto.place.dto.RecordMealVisitRequest;
import com.fitto.place.repository.PlaceVisitRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;

/**
 * 외식 기록 — 장소 확정 + (선택) 식단 + 방문 + (선택) 평점을 한 번의 요청으로. POST /places/meal-visits.
 *
 * <p><b>왜 필요한가</b>(docs/LOVEBODY_LOVELICHELIN_LINK_2026-10-05.md): 앱이 식단 저장 → 방문 저장 → 평점 저장을 각자
 * 엮어 트랜잭션이 셋이었다. 중간에 끊기면 "식단만" 또는 "방문만" 남고, 두 화면(럽바디·럽슐랭)이 서로 다른 값(사진·메모·
 * 날짜·재방문 의사)을 보냈다. 외식 한 번에 상대 폰은 두 번 울렸다.
 *
 * <p><b>트랜잭션 경계</b>
 * <ol>
 *   <li>장소 확정은 <b>본 트랜잭션 밖</b>에서 한다 — {@link PlaceService#save} 가 UNIQUE(couple, kakao id) 충돌을 새 트랜잭션에서
 *       다시 읽는 구조라(SUPPORTS) 본 트랜잭션 안에서 충돌하면 전체가 롤백 전용이 된다. 본 트랜잭션이 실패해도 장소("가고 싶은
 *       곳") 하나는 남는다 — 예전 럽바디 [추가]도 그랬으므로 새 손해가 아니다. FREE 한도(402)도 여기서 난다.</li>
 *   <li>본 트랜잭션: 식단(같이 먹기면 짝 2행) → 방문 1행(내 몫 식단에 연결) → 평점(대표 평점이 없을 때만, 결정 Q3).</li>
 *   <li>알림은 식단이 있으면 <b>식단 푸시 한 건</b>(장소 이름을 싣는다), 없으면 방문 푸시 한 건. "평가를 기다려요" 재촉은 보내지
 *       않는다(같은 외식의 두 번째 알림이 된다). 등극 푸시는 그대로 — 드물고 따로 알릴 가치가 있다.</li>
 * </ol>
 *
 * <p><b>멱등</b>: {@code place_visits (visited_by, client_request_id)} unique(V129). 같은 키의 재전송은 저장 없이 처음 결과를
 * 돌려준다. 식단도 같은 키를 {@code meals.client_request_id}(V118)에 남긴다.
 */
@Service
public class MealVisitService {

    private final PlaceService placeService;
    private final MealService mealService;
    private final PlaceVisitRepository placeVisitRepository;
    private final MealRepository mealRepository;
    private final TransactionTemplate tx;

    public MealVisitService(PlaceService placeService,
                            MealService mealService,
                            PlaceVisitRepository placeVisitRepository,
                            MealRepository mealRepository,
                            PlatformTransactionManager transactionManager) {
        this.placeService = placeService;
        this.mealService = mealService;
        this.placeVisitRepository = placeVisitRepository;
        this.mealRepository = mealRepository;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public MealVisitResponse record(Long userId, RecordMealVisitRequest req) {
        String key = req.clientRequestId().trim();
        MealVisitResponse replay = tx.execute(s -> placeVisitRepository.findByVisitedByAndClientRequestId(userId, key)
                .map(v -> replayOf(userId, v))
                .orElse(null));
        if (replay != null) {
            return replay;
        }
        if ((req.placeId() == null) == (req.place() == null)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "장소를 하나 골라 주세요.");
        }
        LocalDate visitedAt = req.visitedAt() != null ? req.visitedAt() : KstClock.today();
        if (visitedAt.isAfter(KstClock.today())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "미래 날짜는 기록할 수 없습니다.");
        }

        // ① 장소 확정 — 본 트랜잭션 밖(클래스 주석)
        Long placeId;
        Boolean created = null;
        if (req.placeId() != null) {
            placeId = req.placeId();
        } else {
            PlaceResponse saved = placeService.save(userId, req.place());
            placeId = saved.id();
            created = saved.created();
        }
        final Boolean placeCreated = created;

        // ② 본 트랜잭션
        try {
            return tx.execute(s -> recordOnce(userId, placeId, placeCreated, key, visitedAt, req));
        } catch (DataIntegrityViolationException raced) {
            // 같은 키가 거의 동시에 두 번 왔다 — 먼저 들어간 쪽 결과를 돌려준다(새 트랜잭션에서)
            MealVisitResponse winner = tx.execute(s -> placeVisitRepository
                    .findByVisitedByAndClientRequestId(userId, key)
                    .map(v -> replayOf(userId, v))
                    .orElse(null));
            if (winner == null) {
                throw raced;
            }
            return winner;
        }
    }

    private MealVisitResponse recordOnce(Long userId, Long placeId, Boolean placeCreated, String key,
                                         LocalDate visitedAt, RecordMealVisitRequest req) {
        Place place = placeService.couplePlace(userId, placeId);
        int tierBefore = place.getLovelichelinTier();
        String photoUrl = blankToNull(req.photoUrl());

        MealResponse meal = null;
        RecordMealVisitRequest.MealPart part = req.meal();
        if (part != null) {
            SaveMealRequest saveMeal = new SaveMealRequest(visitedAt, part.mealType(), blankToNull(part.memo()), photoUrl,
                    part.calories(), part.carbs(), part.protein(), part.fat(),
                    part.sugar(), part.sodium(), part.fiber(), part.items(), part.sharedWithPartner(), key);
            meal = mealService.save(userId, saveMeal, place.getName());
        }

        PlaceVisit visit = placeService.createVisit(userId, place, visitedAt, req.rating(), blankToNull(req.memo()),
                photoUrl, meal != null ? meal.id() : null, key, meal == null);
        // 사람마다 한 개인 대표 평점 — 비어 있을 때만 이 별점으로 채운다(결정 Q3)
        placeService.rateIfUnrated(userId, placeId, req.rating(), req.revisitIntent());

        // created — 검색 결과로 보냈을 때만 의미가 있다(true = 이번에 새로 담긴 장소, false = 이미 있던 곳)
        PlaceResponse placeResponse = placeService.placeResponse(userId, placeId);
        if (placeCreated != null) placeResponse = placeResponse.withCreated(placeCreated);
        boolean tierUp = tierBefore == 0 && placeResponse.lovelichelinTier() > 0;
        return new MealVisitResponse(false, placeResponse, placeService.visitResponse(visit), meal, tierUp);
    }

    private MealVisitResponse replayOf(Long userId, PlaceVisit visit) {
        MealResponse meal = visit.getMealId() == null ? null
                : mealRepository.findById(visit.getMealId()).map(MealResponse::from).orElse(null);
        return new MealVisitResponse(true, placeService.placeResponse(userId, visit.getPlaceId()),
                placeService.visitResponse(visit), meal, false);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
