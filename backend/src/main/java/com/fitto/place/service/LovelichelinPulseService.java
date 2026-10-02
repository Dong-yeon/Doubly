package com.fitto.place.service;

import com.fitto.common.time.KstClock;
import com.fitto.content.domain.Content;
import com.fitto.content.domain.ContentRating;
import com.fitto.content.repository.ContentLogRepository;
import com.fitto.content.repository.ContentRatingRepository;
import com.fitto.content.repository.ContentRepository;
import com.fitto.place.domain.Place;
import com.fitto.place.domain.PlaceRating;
import com.fitto.place.dto.LovelichelinPulseResponse;
import com.fitto.place.dto.LovelichelinPulseResponse.Kind;
import com.fitto.place.dto.LovelichelinPulseResponse.Signal;
import com.fitto.place.dto.LovelichelinPulseResponse.State;
import com.fitto.place.repository.LovelichelinActivityRow;
import com.fitto.place.repository.PlaceRatingRepository;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * 홈 이름 옆 럽슐랭 왕관 — 그 사람이 오늘 럽슐랭에 기록했는가, 그 사람이 관여한 곳이 막 등극했는가.
 *
 * <table border="1">
 *   <caption>사람마다 하나</caption>
 *   <tr><th>상태</th><th>조건</th></tr>
 *   <tr><td>CERTIFIED</td><td>그 사람이 대표 평점을 남긴 장소·콘텐츠가 최근 24시간 안에 등극
 *       ({@code lovelichelin_certified_at}). 등극은 둘 다 평가해야 하므로 보통 두 사람 다 해당된다 — "둘의 럽슐랭"이다</td></tr>
 *   <tr><td>TODAY</td><td>오늘(KST) 그 사람이 방문 기록·관람 기록·대표 평점 중 하나라도 남겼다</td></tr>
 * </table>
 * 둘 다면 CERTIFIED 가 앞선다. 누르면 갈 곳은 CERTIFIED 면 그 등극한 곳(여럿이면 가장 최근), TODAY 면 오늘 가장
 * 마지막으로 손댄 곳이다.
 *
 * <p><b>시간대</b>: 기록 시각은 서버 벽시계로 저장된다(운영은 UTC). KST 하루의 경계를 저장 TZ 로 바꿔 비교한다 —
 * {@code GameStreakService}·{@code MemoryDates} 와 같은 {@code fitto.storage-zone} 규칙이다. "최근 24시간"은 기간이라
 * 저장 TZ 의 지금에서 24시간을 뺀다(등극 시각도 같은 벽시계로 찍힌다).
 */
@Service
@Transactional(readOnly = true)
public class LovelichelinPulseService {

    static final Duration CERTIFIED_WINDOW = Duration.ofHours(24);

    private final RelationRepository relationRepository;
    private final PlaceRepository placeRepository;
    private final PlaceVisitRepository placeVisitRepository;
    private final PlaceRatingRepository placeRatingRepository;
    private final ContentRepository contentRepository;
    private final ContentLogRepository contentLogRepository;
    private final ContentRatingRepository contentRatingRepository;
    private final ZoneId storageZone;

    public LovelichelinPulseService(RelationRepository relationRepository,
                                    PlaceRepository placeRepository,
                                    PlaceVisitRepository placeVisitRepository,
                                    PlaceRatingRepository placeRatingRepository,
                                    ContentRepository contentRepository,
                                    ContentLogRepository contentLogRepository,
                                    ContentRatingRepository contentRatingRepository,
                                    @Value("${fitto.storage-zone:}") String storageZone) {
        this.relationRepository = relationRepository;
        this.placeRepository = placeRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.placeRatingRepository = placeRatingRepository;
        this.contentRepository = contentRepository;
        this.contentLogRepository = contentLogRepository;
        this.contentRatingRepository = contentRatingRepository;
        this.storageZone = (storageZone == null || storageZone.isBlank())
                ? ZoneId.systemDefault()
                : ZoneId.of(storageZone);
    }

    public LovelichelinPulseResponse pulse(Long viewerId) {
        // 홈이 매번 부른다 — 미연결이면 404 대신 빈 신호(콘솔·토스트가 시끄럽지 않게)
        Optional<Relation> couple = relationRepository
                .findByUserAndTypeAndStatus(viewerId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst();
        if (couple.isEmpty()) {
            return LovelichelinPulseResponse.none();
        }
        Long coupleId = couple.get().getId();
        Long partnerId = couple.get().partnerOf(viewerId);

        LocalDate today = KstClock.today();
        LocalDateTime from = today.atStartOfDay(KstClock.ZONE).withZoneSameInstant(storageZone).toLocalDateTime();
        LocalDateTime to = today.plusDays(1).atStartOfDay(KstClock.ZONE).withZoneSameInstant(storageZone).toLocalDateTime();
        LocalDateTime certifiedSince = LocalDateTime.now(storageZone).minus(CERTIFIED_WINDOW);

        List<Candidate> certified = certifiedCandidates(coupleId, certifiedSince);
        List<Candidate> todays = todayCandidates(coupleId, from, to);

        return new LovelichelinPulseResponse(
                signalFor(viewerId, viewerId, certified, todays),
                partnerId == null ? null : signalFor(partnerId, viewerId, certified, todays));
    }

    /** 신호 후보 한 건 — userId 는 그 활동을 한(또는 그 등극에 평점을 보탠) 사람 */
    private record Candidate(Kind kind, Long targetId, String targetName, Long userId, LocalDateTime at,
                             int tier, String certificationKey) {
    }

    private Signal signalFor(Long personId, Long viewerId, List<Candidate> certified, List<Candidate> todays) {
        Comparator<Candidate> latestFirst = Comparator.comparing(Candidate::at).reversed();
        Optional<Candidate> pick = certified.stream().filter(c -> personId.equals(c.userId())).min(latestFirst);
        State state = State.CERTIFIED;
        if (pick.isEmpty()) {
            pick = todays.stream().filter(c -> personId.equals(c.userId())).min(latestFirst);
            state = State.TODAY;
        }
        if (pick.isEmpty()) {
            return null;
        }
        Candidate c = pick.get();
        return new Signal(state, c.kind(), c.targetId(), c.targetName(), c.tier(),
                state == State.CERTIFIED ? c.certificationKey() : null,
                viewerRated(c.kind(), c.targetId(), viewerId));
    }

    /** 등극 24시간 안 — 그 곳에 대표 평점을 남긴 사람마다 한 건씩 */
    private List<Candidate> certifiedCandidates(Long coupleId, LocalDateTime since) {
        List<Candidate> out = new ArrayList<>();
        List<Place> places = placeRepository.findByCoupleIdAndLovelichelinCertifiedAtGreaterThanEqual(coupleId, since);
        if (!places.isEmpty()) {
            List<PlaceRating> ratings = placeRatingRepository.findByPlaceIdIn(places.stream().map(Place::getId).toList());
            for (Place p : places) {
                if (p.getLovelichelinTier() <= 0) continue; // 등극 직후 탈락했다(탈락하면 시각도 지워지지만 방어)
                for (PlaceRating r : ratings) {
                    if (r.getPlaceId().equals(p.getId())) {
                        out.add(new Candidate(Kind.PLACE, p.getId(), p.getName(), r.getUserId(),
                                p.getLovelichelinCertifiedAt(), p.getLovelichelinTier(),
                                keyOf(Kind.PLACE, p.getId(), p.getLovelichelinCertifiedAt())));
                    }
                }
            }
        }
        List<Content> contents = contentRepository.findByCoupleIdAndLovelichelinCertifiedAtGreaterThanEqual(coupleId, since);
        if (!contents.isEmpty()) {
            List<ContentRating> ratings = contentRatingRepository.findByContentIdIn(contents.stream().map(Content::getId).toList());
            for (Content c : contents) {
                if (c.getLovelichelinTier() <= 0) continue;
                for (ContentRating r : ratings) {
                    if (r.getContentId().equals(c.getId())) {
                        out.add(new Candidate(Kind.CONTENT, c.getId(), c.getTitle(), r.getUserId(),
                                c.getLovelichelinCertifiedAt(), c.getLovelichelinTier(),
                                keyOf(Kind.CONTENT, c.getId(), c.getLovelichelinCertifiedAt())));
                    }
                }
            }
        }
        return out;
    }

    /** 오늘(KST) — 방문·관람 기록, 대표 평점(재평가 포함) */
    private List<Candidate> todayCandidates(Long coupleId, LocalDateTime from, LocalDateTime to) {
        List<Candidate> out = new ArrayList<>();
        add(out, Kind.PLACE, placeVisitRepository.findActivityBetween(coupleId, from, to));
        add(out, Kind.PLACE, placeRatingRepository.findActivityBetween(coupleId, from, to));
        add(out, Kind.CONTENT, contentLogRepository.findActivityBetween(coupleId, from, to));
        add(out, Kind.CONTENT, contentRatingRepository.findActivityBetween(coupleId, from, to));
        return out;
    }

    private static void add(List<Candidate> out, Kind kind, List<LovelichelinActivityRow> rows) {
        for (LovelichelinActivityRow r : rows) {
            if (r.getAt() == null) continue;
            out.add(new Candidate(kind, r.getTargetId(), r.getTargetName(), r.getUserId(), r.getAt(), 0, null));
        }
    }

    private boolean viewerRated(Kind kind, Long targetId, Long viewerId) {
        return kind == Kind.PLACE
                ? placeRatingRepository.findByPlaceIdAndUserId(targetId, viewerId).isPresent()
                : contentRatingRepository.findByContentIdAndUserId(targetId, viewerId).isPresent();
    }

    /** 등극 한 번을 가리키는 열쇠 — 탈락했다 다시 등극하면 시각이 달라 새 열쇠가 된다 */
    static String keyOf(Kind kind, Long id, LocalDateTime certifiedAt) {
        return kind.name() + ":" + id + ":" + Objects.toString(certifiedAt);
    }
}
