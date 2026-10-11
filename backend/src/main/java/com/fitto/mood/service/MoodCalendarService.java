package com.fitto.mood.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.time.KstClock;
import com.fitto.coupleemoji.domain.CoupleEmoji;
import com.fitto.coupleemoji.repository.CoupleEmojiRepository;
import com.fitto.mood.domain.MoodStatus;
import com.fitto.mood.dto.MoodCalendarResponse;
import com.fitto.mood.dto.MoodCalendarResponse.MoodCalendarDay;
import com.fitto.mood.dto.MoodCalendarResponse.MoodMark;
import com.fitto.mood.dto.MoodDayResponse;
import com.fitto.mood.dto.MoodDayResponse.MoodDayEntry;
import com.fitto.mood.repository.MoodStatusRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * 무드 달력 — 두 사람의 지난 무드를 날짜별로 나란히 본다.
 *
 * <p>새 테이블이 없다. {@code mood_statuses} 가 처음부터 덮어쓰지 않고 쌓는 원장(V44)이라
 * 이력은 이미 있었고, 없던 것은 조회와 화면뿐이었다(docs/daily-mood-current-state.md §5).
 *
 * <p><b>날짜 경계는 KST 다.</b> {@code created_at} 은 저장 TZ(운영 UTC)의 벽시계라, 그대로 날짜를
 * 자르면 KST 00~09시 무드가 전날로 간다. 추억(MemoryDates)과 같은 규칙으로 {@code fitto.storage-zone}
 * (비어 있으면 JVM 기본 TZ)을 저장 TZ 로 보고 옮긴다.
 *
 * <p><b>무료는 최근 30일</b>({@link Feature#MOOD_CALENDAR_FULL}). 화면이 열릴 때마다 부르는 조회라
 * 402 를 던지지 않고 {@code lockedBefore} 로 내려 화면이 그 자리에 안내를 그리게 한다
 * ({@link PlanGuard#allows} 주석). 커플 단위 판정이라 둘 중 하나만 PRO 여도 둘 다 전체를 본다.
 */
@Service
@Transactional(readOnly = true)
public class MoodCalendarService {

    /** 무료로 보는 날 수 — 오늘 포함 */
    static final int FREE_DAYS = 30;

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

    private final MoodStatusRepository moodStatusRepository;
    private final CoupleEmojiRepository coupleEmojiRepository;
    private final RelationRepository relationRepository;
    private final PlanGuard planGuard;
    private final ZoneId storageZone;

    public MoodCalendarService(MoodStatusRepository moodStatusRepository,
                               CoupleEmojiRepository coupleEmojiRepository,
                               RelationRepository relationRepository,
                               PlanGuard planGuard,
                               @Value("${fitto.storage-zone:}") String storageZone) {
        this.moodStatusRepository = moodStatusRepository;
        this.coupleEmojiRepository = coupleEmojiRepository;
        this.relationRepository = relationRepository;
        this.planGuard = planGuard;
        this.storageZone = storageZone == null || storageZone.isBlank()
                ? ZoneId.systemDefault() : ZoneId.of(storageZone);
    }

    public MoodCalendarResponse month(Long userId, String month) {
        YearMonth ym;
        try {
            ym = YearMonth.parse(month);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "달은 2026-10 형식으로 보내주세요.");
        }
        Relation couple = activeCouple(userId);
        LocalDate lockedBefore = lockedBefore(userId);

        LocalDate from = ym.atDay(1);
        if (lockedBefore != null && from.isBefore(lockedBefore)) {
            from = lockedBefore;
        }
        LocalDate to = ym.atEndOfMonth();
        if (from.isAfter(to)) {
            // 달 전체가 잠긴 구간 — 조회하지 않는다
            return new MoodCalendarResponse(ym.toString(), lockedBefore, List.of());
        }

        List<MoodStatus> rows = rowsBetween(couple.getId(), from, to);
        Map<Long, String> images = emojiImages(couple.getId(), rows);
        Long partnerId = couple.partnerOf(userId);

        // 날짜 → (사람 → 그날 무드 시간순). TreeMap 이라 날짜 오름차순이 공짜다.
        Map<LocalDate, Map<Long, List<MoodStatus>>> byDay = new TreeMap<>();
        for (MoodStatus row : rows) {
            byDay.computeIfAbsent(kstDateOf(row.getCreatedAt()), d -> new LinkedHashMap<>())
                    .computeIfAbsent(row.getUserId(), u -> new ArrayList<>())
                    .add(row);
        }

        List<MoodCalendarDay> days = new ArrayList<>();
        byDay.forEach((date, byUser) -> days.add(new MoodCalendarDay(
                date,
                markOf(byUser.get(userId), images),
                partnerId == null ? null : markOf(byUser.get(partnerId), images))));
        return new MoodCalendarResponse(ym.toString(), lockedBefore, days);
    }

    public MoodDayResponse day(Long userId, LocalDate date) {
        Relation couple = activeCouple(userId);
        LocalDate lockedBefore = lockedBefore(userId);
        if (lockedBefore != null && date.isBefore(lockedBefore)) {
            return new MoodDayResponse(date, true, List.of());
        }

        List<MoodStatus> rows = rowsBetween(couple.getId(), date, date);
        Map<Long, String> images = emojiImages(couple.getId(), rows);
        Long partnerId = couple.partnerOf(userId);
        List<MoodDayEntry> entries = rows.stream()
                // 관계에서 나간 사람(재연결 전 기록 등)의 행은 싣지 않는다 — 누구 것인지 말할 수 없다
                .filter(r -> userId.equals(r.getUserId()) || Objects.equals(partnerId, r.getUserId()))
                .map(r -> new MoodDayEntry(
                        userId.equals(r.getUserId()),
                        r.getEmoji(),
                        r.getCoupleEmojiId() == null ? null : images.get(r.getCoupleEmojiId()),
                        r.getMessage(),
                        kstTimeOf(r.getCreatedAt())))
                .toList();
        return new MoodDayResponse(date, false, entries);
    }

    /** 무료면 열리는 첫날(오늘 포함 30일 전), PRO 면 null */
    private LocalDate lockedBefore(Long userId) {
        return planGuard.allows(userId, Feature.MOOD_CALENDAR_FULL)
                ? null
                : KstClock.today().minusDays(FREE_DAYS - 1L);
    }

    /** KST {@code from}~{@code to}(포함)의 무드, 시간순 */
    private List<MoodStatus> rowsBetween(Long coupleId, LocalDate from, LocalDate to) {
        return moodStatusRepository.findByCoupleIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtAscIdAsc(
                coupleId, storageStartOfDay(from), storageStartOfDay(to.plusDays(1)));
    }

    /**
     * 걸려 있는 우리 이모지 이미지 — 한 번에 읽는다(행마다 찾으면 N+1).
     * 숨긴 이모지는 목록에 없으니 저절로 유니코드로 돌아간다(MoodService.withImage 와 같은 약속).
     */
    private Map<Long, String> emojiImages(Long relationId, List<MoodStatus> rows) {
        boolean any = rows.stream().anyMatch(r -> r.getCoupleEmojiId() != null);
        if (!any) {
            return Map.of();
        }
        return coupleEmojiRepository.findAllByRelationIdAndDeletedAtIsNullOrderByIdDesc(relationId).stream()
                .filter(e -> e.getImageUrl() != null)
                .collect(Collectors.toMap(CoupleEmoji::getId, CoupleEmoji::getImageUrl, (a, b) -> a));
    }

    private static MoodMark markOf(List<MoodStatus> rows, Map<Long, String> images) {
        if (rows == null || rows.isEmpty()) {
            return null;
        }
        MoodStatus last = rows.get(rows.size() - 1);
        String image = last.getCoupleEmojiId() == null ? null : images.get(last.getCoupleEmojiId());
        return new MoodMark(last.getEmoji(), image, rows.size());
    }

    LocalDateTime storageStartOfDay(LocalDate kstDate) {
        return kstDate.atStartOfDay(KstClock.ZONE).withZoneSameInstant(storageZone).toLocalDateTime();
    }

    private LocalDate kstDateOf(LocalDateTime stored) {
        return stored.atZone(storageZone).withZoneSameInstant(KstClock.ZONE).toLocalDate();
    }

    private String kstTimeOf(LocalDateTime stored) {
        return stored.atZone(storageZone).withZoneSameInstant(KstClock.ZONE).format(TIME);
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }
}
