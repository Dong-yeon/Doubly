package com.fitto.diet.service;

import com.fitto.place.domain.Place;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * 음식 사진 분석에 붙일 럽슐랭 장소 힌트 — 가게 이름·분류·이 가게에서 예전에 먹은 메뉴.
 *
 * <p><b>왜 필요한가.</b> 사진만 보면 김치찌개집에서 찍은 찌개를 부대찌개로 읽는 식의 오인이
 * 생긴다. 사용자가 이미 "어디서 먹었는지"를 골라뒀다면 그게 가장 강한 단서다. 다만 사진과
 * 어긋날 수 있으므로(같은 가게의 다른 메뉴, 잘못 고른 장소) 프롬프트에서는 참고로만 쓴다
 * ({@link FoodAnalysisService#placeHintBlock}).
 *
 * <p>메뉴는 장소 상세 "여기서 먹은 것"과 같은 집계를 쓴다({@link PlaceVisitRepository#countMenu} — 방문에
 * 연결된 식단의 음식 이름, 많이 먹은 순·같으면 최근 순). 여기서는 <b>원본 값</b>만 돌려준다 — 줄바꿈 제거·길이
 * 자르기는 프롬프트를 조립하는 쪽 몫이다. 조회는 장소·관계·메뉴 고정 3회이고 방문 수와 무관하다.
 */
@Component
public class MealPlaceHintLoader {

    private static final Logger log = LoggerFactory.getLogger(MealPlaceHintLoader.class);

    static final int MAX_MENUS = 10;

    private final PlaceRepository placeRepository;
    private final RelationRepository relationRepository;
    private final PlaceVisitRepository placeVisitRepository;

    public MealPlaceHintLoader(PlaceRepository placeRepository,
                               RelationRepository relationRepository,
                               PlaceVisitRepository placeVisitRepository) {
        this.placeRepository = placeRepository;
        this.relationRepository = relationRepository;
        this.placeVisitRepository = placeVisitRepository;
    }

    /**
     * @param category       앱 분류(음식점·카페 등, 없으면 null)
     * @param categoryDetail 무엇을 파는 곳인지(카카오 세부 분류, V130 — 예: "한식 · 김치찌개", 없으면 null)
     */
    public record PlaceHint(String name, String category, String categoryDetail, List<String> menus) {
    }

    /**
     * 요청자가 접근할 수 있는 장소면 힌트를, 아니면 빈 값을 준다.
     *
     * <p>접근 기준은 장소의 관계에 내가 속해 있고 그 관계가 <b>활성</b>인 것 — 종료된 관계도
     * user_a/b 를 그대로 남기므로 involves 만으로는 헤어진 뒤에도 통과한다({@link Relation#isActive}).
     * 남의 장소는 예외 대신 로그만 남긴다 — 힌트는 덤이라 분석을 막을 이유가 없다.
     */
    public Optional<PlaceHint> forPlace(Long userId, Long placeId) {
        if (placeId == null) {
            return Optional.empty();
        }
        Place place = placeRepository.findById(placeId).orElse(null);
        if (place == null || !accessible(userId, place)) {
            log.info("사진 분석 장소 힌트 무시 — 없거나 내 관계의 장소가 아님 (userId={}, placeId={})", userId, placeId);
            return Optional.empty();
        }
        List<String> menus = placeVisitRepository.countMenu(placeId, PageRequest.of(0, MAX_MENUS)).stream()
                .map(PlaceVisitRepository.MenuCount::getName)
                .toList();
        return Optional.of(new PlaceHint(place.getName(), place.getCategory(), place.getCategoryDetail(), menus));
    }

    private boolean accessible(Long userId, Place place) {
        return relationRepository.findById(place.getCoupleId())
                .map(r -> r.involves(userId) && r.isActive())
                .orElse(false);
    }
}
