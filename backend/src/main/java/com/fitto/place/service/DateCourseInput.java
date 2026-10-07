package com.fitto.place.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.place.dto.DateCourseResponse.Stop;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * AI 데이트 코스의 입력 만들기·출력 읽기 — DB·Gemini 없이 도는 순수 함수만 둔다(단위 테스트 대상, DateCourseInputTest).
 * 설계: docs/LOVELICHELIN_AI_COURSE_2026-10-07.md.
 *
 * <p>규칙 세 가지를 <b>AI 에게 맡기지 않고 서버가 정한다</b>:
 * <ul>
 *   <li>둘 중 한 명이라도 2점 이하를 준 곳은 후보에서 뺀다 — 프롬프트로 부탁하면 가끔 들어온다. 럽슐랭 등급 규칙(2점 이하면 0)과 같은 선.</li>
 *   <li>거리 — 좌표로 서버가 잰다. 입력에는 "가까운 곳: P3 0.4km"를, 출력에는 "다음 장소까지 약 N km"를 서버가 넣는다.</li>
 *   <li>stop 은 이름이 아니라 ref(P12) 로 받는다 — 이름이 같은 장소를 가르고, 목록에 없는 곳(환각)은 버린다.</li>
 * </ul>
 */
final class DateCourseInput {

    /** 이 점수 이하를 한 명이라도 줬으면 코스 후보에서 뺀다 */
    static final int EXCLUDE_AT_OR_BELOW = 2;
    /** 장소마다 알려 주는 가까운 곳 수 */
    static final int NEAREST = 3;
    /** 프롬프트에 싣는 장소 상한 — 무제한 플랜에서 입력이 끝없이 길어지지 않게(최근 저장 순) */
    static final int MAX_PLACES = 60;

    private DateCourseInput() {
    }

    /**
     * 코스 후보 장소 한 곳 — 우리 기록에서 AI 에게 줄 것만 추린 것.
     *
     * @param lat/lng 좌표(없으면 null) — 지도에 핀이 없는 곳
     * @param mine/partner 나·상대 대표 평점(없으면 null)
     */
    record PlaceCandidate(Long id, String name, String category, String categoryDetail, String address,
                          Double lat, Double lng, long visitCount, LocalDate lastVisitedAt,
                          Integer mine, Integer partner, int tier) {
        boolean visited() {
            return visitCount > 0;
        }

        boolean hasCoords() {
            return lat != null && lng != null;
        }

        String ref() {
            return "P" + id;
        }

        /** 앱이 보여 줄 카테고리 — 세부 분류가 있으면 그것("한식 · 냉면"), 없으면 7종 카테고리 */
        String displayCategory() {
            return categoryDetail != null && !categoryDetail.isBlank() ? categoryDetail : category;
        }
    }

    /**
     * 후보 거르기 — 한 명이라도 {@value #EXCLUDE_AT_OR_BELOW}점 이하면 빼고, "안 가본 곳 포함"을 껐으면 다녀온 곳만.
     * 순서는 그대로(최근 저장 순), 상한 {@value #MAX_PLACES}.
     */
    static List<PlaceCandidate> filterPlaces(List<PlaceCandidate> all, boolean includeUnvisited) {
        return all.stream()
                .filter(p -> !lowRated(p.mine()) && !lowRated(p.partner()))
                .filter(p -> includeUnvisited || p.visited())
                .limit(MAX_PLACES)
                .toList();
    }

    static boolean lowRated(Integer rating) {
        return rating != null && rating <= EXCLUDE_AT_OR_BELOW;
    }

    /**
     * 장소 목록 → 프롬프트 줄. 한 줄 예:
     * {@code - P12 을밀대 [음식점 · 한식 > 냉면] (서울 마포구 염리동) · 다녀옴 3회, 마지막 2026-09-20 · 평점 나 5/상대 4 · 럽스타 2개 · 가까운 곳: P3 0.4km, P7 1.2km}
     */
    static String describePlaces(List<PlaceCandidate> places) {
        return places.stream().map(p -> describePlace(p, places)).collect(Collectors.joining("\n"));
    }

    private static String describePlace(PlaceCandidate p, List<PlaceCandidate> all) {
        StringBuilder sb = new StringBuilder("- ").append(p.ref()).append(' ').append(p.name());
        String cat = joinNonBlank(" · ", p.category(), p.categoryDetail());
        if (!cat.isEmpty()) sb.append(" [").append(cat).append(']');
        if (p.address() != null && !p.address().isBlank()) sb.append(" (").append(p.address()).append(')');
        sb.append(p.visited()
                ? " · 다녀옴 " + p.visitCount() + "회" + (p.lastVisitedAt() != null ? ", 마지막 " + p.lastVisitedAt() : "")
                : " · 아직 안 가봄");
        if (p.mine() != null || p.partner() != null) {
            sb.append(" · 평점 나 ").append(p.mine() != null ? p.mine() : "-")
                    .append("/상대 ").append(p.partner() != null ? p.partner() : "-");
        }
        if (p.tier() > 0) sb.append(" · 럽스타 ").append(p.tier()).append("개");
        if (p.hasCoords()) {
            String near = nearest(p, all).stream()
                    .map(n -> n.ref() + " " + formatKm(distanceKm(p, n)))
                    .collect(Collectors.joining(", "));
            if (!near.isEmpty()) sb.append(" · 가까운 곳: ").append(near);
        } else {
            sb.append(" · 위치 정보 없음");
        }
        return sb.toString();
    }

    /** 좌표 있는 다른 후보 중 가까운 {@value #NEAREST}곳 */
    static List<PlaceCandidate> nearest(PlaceCandidate p, List<PlaceCandidate> all) {
        if (!p.hasCoords()) return List.of();
        return all.stream()
                .filter(o -> o != p && o.hasCoords() && !o.id().equals(p.id()))
                .sorted(Comparator.comparingDouble(o -> distanceKm(p, o)))
                .limit(NEAREST)
                .toList();
    }

    /** 두 장소의 직선 거리(km) — 하버사인. 도보·대중교통 경로가 아니라 "대략 얼마나 떨어졌나"의 감이다 */
    static double distanceKm(PlaceCandidate a, PlaceCandidate b) {
        return distanceKm(a.lat(), a.lng(), b.lat(), b.lng());
    }

    static double distanceKm(double lat1, double lng1, double lat2, double lng2) {
        double r = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    /** 소수 한 자리(0.05km 미만은 0.1 로 — "0km"는 같은 건물로 읽힌다) */
    static double roundKm(double km) {
        return Math.max(0.1, Math.round(km * 10) / 10.0);
    }

    static String formatKm(double km) {
        return String.format(Locale.ROOT, "%.1fkm", roundKm(km));
    }

    /**
     * AI 출력의 stops → 응답 stop. ref 로 우리 기록을 찾고, 목록에 없거나 이미 나온 ref 는 버린다. 이름·카테고리는 기록에서 채운다.
     * 마지막에 이어지는 두 장소가 둘 다 좌표를 가지면 앞 stop 에 "다음 장소까지" 거리를 넣는다.
     */
    static List<Stop> toStops(JsonNode result, Map<String, PlaceCandidate> placesByRef) {
        List<Stop> stops = new ArrayList<>();
        List<PlaceCandidate> placeOfStop = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode s : result.path("stops")) {
            String ref = normalizeRef(s.path("ref").asText(""));
            if (ref.isEmpty() || !seen.add(ref)) continue;
            String reason = s.path("reason").asText(null);
            PlaceCandidate p = placesByRef.get(ref);
            if (p == null) continue;
            stops.add(new Stop("PLACE", p.id(), p.name(), p.displayCategory(), reason, null, null, null));
            placeOfStop.add(p);
        }
        for (int i = 0; i + 1 < stops.size(); i++) {
            PlaceCandidate a = placeOfStop.get(i);
            PlaceCandidate b = placeOfStop.get(i + 1);
            if (a != null && b != null && a.hasCoords() && b.hasCoords()) {
                Stop s = stops.get(i);
                stops.set(i, new Stop(s.kind(), s.id(), s.name(), s.category(), s.reason(),
                        roundKm(distanceKm(a, b)), s.posterUrl(), s.contentType()));
            }
        }
        return stops;
    }

    /**
     * 프롬프트 — 선택 입력(시간대·분위기·안 가본 곳)에 따라 규칙 줄이 붙는다. 입력 문자열 전체가 AI 결과 캐시 키라(AiResultCache)
     * 옵션을 바꾸면 지난 코스를 그대로 돌려주지 않는다.
     */
    static String prompt(com.fitto.place.dto.DateCourseOptions options, List<PlaceCandidate> places) {
        List<String> rules = new ArrayList<>();
        rules.add("stops: 방문 순서대로 " + stopRange(options) + "곳. 각 stop 의 ref 는 아래 목록의 ref(P숫자)를 그대로 씁니다. 목록에 없는 ref 는 만들지 않습니다.");
        rules.add("reason: 이 순서에 넣은 이유를 한 문장 한국어로. 거리 숫자는 쓰지 않습니다(앱이 따로 보여 줍니다).");
        rules.add("동선: '가까운 곳'에 적힌 거리를 참고해 가까운 곳끼리 이어지게 순서를 정합니다. 거리를 직접 계산하지 않습니다. 위치 정보가 없는 곳은 동선 근거가 약하니 꼭 필요할 때만 넣습니다.");
        rules.add("흐름: 식사→카페→산책처럼 시간 흐름이 자연스럽게.");
        boolean hasUnvisited = places.stream().anyMatch(p -> !p.visited());
        boolean hasVisited = places.stream().anyMatch(PlaceCandidate::visited);
        if (options.includeUnvisited() && hasUnvisited) {
            rules.add(hasVisited
                    ? "'아직 안 가봄'인 곳을 최소 1곳 넣습니다. 나머지는 둘이 좋게 평가한 곳을 우선합니다."
                    : "'아직 안 가봄'인 곳으로 새 경험이 되게 짭니다.");
        }
        if (options.timeSlot() != null) {
            rules.add(switch (options.timeSlot()) {
                case LUNCH -> "시간대: 점심 식사로 시작하는 반나절 코스.";
                case DINNER -> "시간대: 저녁 식사를 중심으로 한 저녁 코스.";
                case DAY -> "시간대: 하루 종일 코스(식사 두 번이 겹치지 않게).";
            });
        }
        if (options.mood() != null) {
            rules.add(switch (options.mood()) {
                case CALM -> "분위기: 조용히 이야기 나누기 좋은 곳 위주.";
                case ACTIVE -> "분위기: 걷거나 체험하는 활동적인 곳을 섞어서.";
            });
        }
        rules.add("comment: 이 코스에 대한 다정한 한 줄 소개(한국어).");
        return "아래는 한 커플이 저장한 장소 목록입니다. 이 중에서 골라 데이트 코스를 짜주세요.\n"
                + rules.stream().map(r -> "- " + r).collect(Collectors.joining("\n"))
                + "\n\n[저장된 장소]\n" + describePlaces(places);
    }

    static String stopRange(com.fitto.place.dto.DateCourseOptions options) {
        return options.timeSlot() == com.fitto.place.dto.DateCourseOptions.TimeSlot.DAY ? "3~4" : "2~4";
    }

    /** "p12", " P12 ", "[P12]" → "P12" */
    static String normalizeRef(String raw) {
        return raw.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
    }

    static Map<String, PlaceCandidate> byRef(List<PlaceCandidate> places) {
        return places.stream().collect(Collectors.toMap(PlaceCandidate::ref, p -> p, (a, b) -> a));
    }

    private static String joinNonBlank(String sep, String... parts) {
        List<String> kept = new ArrayList<>();
        for (String p : parts) if (p != null && !p.isBlank()) kept.add(p);
        return String.join(sep, kept);
    }
}
