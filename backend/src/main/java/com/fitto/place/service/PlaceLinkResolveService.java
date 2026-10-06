package com.fitto.place.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.place.dto.ResolvePlaceLinkResponse;
import com.fitto.place.dto.ResolvePlaceLinkResponse.Candidate;
import com.fitto.place.domain.Place;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.service.KakaoLocalClient.KakaoPlace;
import com.fitto.place.service.PlaceLinkFetcher.FetchException;
import com.fitto.place.service.PlaceLinkFetcher.Page;
import com.fitto.place.service.PlaceLinkHosts.PlaceRef;
import com.fitto.place.service.PlaceLinkHosts.Provider;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * 채팅에 붙은 지도 링크 → 럽슐랭 장소 후보 (docs/LOVELICHELIN_CHAT_LINK_2026-10-02.md).
 *
 * <p><b>저장은 하지 않는다</b>. 후보를 돌려주면 앱이 사용자가 고른 것을 {@code POST /places} 로 저장한다 —
 * 그래야 플랜 한도(FREE 장소 20개)·기능 사용량 계측·중복 방지가 장소 추가와 똑같이 걸린다.
 *
 * <p><b>카카오 링크</b>: 장소 id 로 상세를 주는 공식 카카오 로컬 API 는 없다(공식 문서의 로컬 API 는
 * 주소·좌표 변환과 키워드·카테고리 검색뿐, 2026-10-02 확인). 그래서 페이지의 og:title(가게 이름)로 키워드
 * 검색해 <b>id 가 같은 결과</b>를 고른다. 이름만으로 못 찾으면 주소 앞부분을 붙여 한 번 더 찾는다.
 *
 * <p><b>네이버 링크</b>: 네이버 장소 id 로 조회하는 공식 API 도 없다(검색 API 의 지역 검색은 키워드 검색이고
 * 네이버 장소 id 를 돌려주지 않는다). 이름(+주소 앞부분)으로 카카오 검색한 후보 1~3개를 보여 주고 사용자가
 * 고르게 한다 — 서로 다른 지도의 장소를 기계가 같은 곳이라고 단정하지 않는다.
 *
 * <p>여기서 실패는 예외가 아니라 빈 후보다 — 칩은 "못 찾았어요"보다 "직접 찾아볼게요"(장소 추가 화면)로 이어진다.
 */
@Service
public class PlaceLinkResolveService {

    private static final Logger log = LoggerFactory.getLogger(PlaceLinkResolveService.class);

    /** 카카오 키워드 검색 한 페이지 최대치 — id 로 정확히 찾을 때는 넓게 본다 */
    private static final int EXACT_SEARCH_SIZE = 15;
    private static final int MAX_CANDIDATES = 3;

    private final PlaceLinkFetcher fetcher;
    private final KakaoLocalClient kakaoLocalClient;
    private final PlaceRepository placeRepository;
    private final RelationRepository relationRepository;
    private final PlaceLinkRateLimiter rateLimiter;

    public PlaceLinkResolveService(PlaceLinkFetcher fetcher, KakaoLocalClient kakaoLocalClient,
                                   PlaceRepository placeRepository, RelationRepository relationRepository,
                                   PlaceLinkRateLimiter rateLimiter) {
        this.fetcher = fetcher;
        this.kakaoLocalClient = kakaoLocalClient;
        this.placeRepository = placeRepository;
        this.relationRepository = relationRepository;
        this.rateLimiter = rateLimiter;
    }

    public ResolvePlaceLinkResponse resolve(Long userId, String url) {
        return resolve(userId, url, null);
    }

    /**
     * @param messageText 링크가 붙어 온 메시지 본문 — 페이지에서 이름을 못 읽었을 때만 쓴다
     *                    ({@link PlaceLinkPageParser#fromShareText})
     */
    public ResolvePlaceLinkResponse resolve(Long userId, String url, String messageText) {
        Relation couple = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
        // 커플 확인 뒤에 센다 — 미연결 사용자의 헛요청이 한도를 깎지 않게
        rateLimiter.check(userId);

        String originalProvider = providerName(url);
        if (originalProvider == null) {
            // 허용 목록 밖 링크 — 열지도, 본문으로 검색하지도 않는다
            return ResolvePlaceLinkResponse.unresolved(null, null);
        }
        PlaceRef ref = null;
        String providerName = originalProvider;
        PlaceLinkPageParser.Parsed parsed = new PlaceLinkPageParser.Parsed(null, null);
        try {
            Page page = fetcher.fetch(url);
            ref = page.ref();
            Provider provider = ref != null ? ref.provider()
                    : PlaceLinkHosts.providerOf(page.finalUrl()).orElse(null);
            if (provider != null) {
                providerName = provider.name();
            }
            parsed = PlaceLinkPageParser.parse(page.body(), provider);
        } catch (FetchException e) {
            log.info("채팅 링크 해석 — 페이지를 못 열었다: {}", e.getMessage());
            if (e.failure() == PlaceLinkFetcher.Failure.NOT_ALLOWED
                    || e.failure() == PlaceLinkFetcher.Failure.PRIVATE_ADDRESS) {
                // 막아야 해서 막은 링크다 — 본문으로 우회해 후보를 만들어 주지 않는다
                return ResolvePlaceLinkResponse.unresolved(originalProvider, null);
            }
            // 페이지는 못 열었어도 링크 자체에 id 가 있으면(place.map.kakao.com/123) 확정에 쓴다
            ref = PlaceLinkHosts.extract(URI.create(url.trim())).orElse(null);
        }
        if (parsed.title() == null) {
            // 페이지가 막혔거나(네이버 429 등) 이름이 없었다 — 공유 메시지에 실린 이름·주소로 이어 간다
            parsed = PlaceLinkPageParser.fromShareText(messageText);
        }
        if (parsed.title() == null) {
            return ResolvePlaceLinkResponse.unresolved(providerName, null);
        }
        String title = parsed.title();
        String region = PlaceLinkPageParser.regionOf(parsed.addressHint());

        // 카카오 링크 — id 가 같은 검색 결과가 곧 그 장소다
        if (ref != null && ref.provider() == Provider.KAKAO) {
            // 이름이 공유 메시지에서 왔어도 링크의 id 로 확정할 수 있으면 확정한다
            Optional<KakaoPlace> exact = findById(title, ref.placeId());
            if (exact.isEmpty() && region != null) {
                exact = findById(title + " " + region, ref.placeId());
            }
            if (exact.isPresent()) {
                Candidate candidate = toCandidate(exact.get(), couple.getId());
                return new ResolvePlaceLinkResponse(providerName, true, title, candidate.existingPlaceId(),
                        List.of(candidate));
            }
        }

        // 네이버 링크, 또는 카카오인데 id 로 못 찾았다 — 이름(+지역)으로 찾은 후보를 사용자에게 고르게 한다
        List<KakaoPlace> found = region != null
                ? kakaoLocalClient.searchKeyword(title + " " + region, MAX_CANDIDATES)
                : List.of();
        if (found.isEmpty()) {
            found = kakaoLocalClient.searchKeyword(title, MAX_CANDIDATES);
        }
        List<Candidate> candidates = new ArrayList<>();
        for (KakaoPlace place : found) {
            if (candidates.size() >= MAX_CANDIDATES) {
                break;
            }
            candidates.add(toCandidate(place, couple.getId()));
        }
        return new ResolvePlaceLinkResponse(providerName, false, title, null, candidates);
    }

    private Optional<KakaoPlace> findById(String query, String kakaoPlaceId) {
        return kakaoLocalClient.searchKeyword(query, EXACT_SEARCH_SIZE).stream()
                .filter(p -> Objects.equals(p.id(), kakaoPlaceId))
                .findFirst();
    }

    private Candidate toCandidate(KakaoPlace p, Long coupleId) {
        Long existing = p.id() == null ? null
                : placeRepository.findFirstByCoupleIdAndKakaoPlaceId(coupleId, p.id()).map(Place::getId).orElse(null);
        return new Candidate(p.id(), p.name(), p.address(), p.category(), p.lat(), p.lng(), p.placeUrl(), existing,
                p.categoryDetail(), p.phone(), PlaceLinks.detailUrl(p.id()));
    }

    private static String providerName(String url) {
        try {
            return PlaceLinkHosts.providerOf(new URI(url.trim())).map(Enum::name).orElse(null);
        } catch (URISyntaxException | NullPointerException e) {
            return null;
        }
    }
}
