package com.fitto.feed.dto;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.EnumMap;
import java.util.Map;

/**
 * 타임라인 커서 — 소스별 (createdAt, id) 위치를 함께 담는다.
 *
 * <p><b>왜 소스별로 나눴나</b>: 타임라인은 포스트·운동·식단·방문 4개 테이블을 합쳐 만든다.
 * 커서를 타임스탬프 하나로 두면 두 가지가 깨진다.
 * <ul>
 *   <li>같은 시각의 아이템이 페이지 경계에 걸리면 다음 페이지에서 <b>영구히 누락</b>된다
 *       (조회 조건이 {@code createdAt < cursor} 인 탓).</li>
 *   <li>테이블마다 id 공간이 달라 전역 보조 정렬키를 쓸 수 없다.</li>
 * </ul>
 * 각 소스의 "어디까지 읽었는지"를 따로 기억하면 두 문제가 함께 사라진다.
 *
 * <p>인코딩은 {@code POST:<epochSecond>.<nano>:<id>|WORKOUT:...} 를 Base64URL 로 감싼 형태다.
 * 클라이언트는 내용을 해석하지 않고 그대로 되돌려주기만 하면 된다(불투명 토큰).
 */
public record FeedCursor(Map<FeedItemType, Position> positions) {

    private static final Logger log = LoggerFactory.getLogger(FeedCursor.class);

    /** 소스별 마지막 소비 위치. 이 지점보다 "이전"부터 다음 페이지를 읽는다. */
    public record Position(LocalDateTime createdAt, Long id) {
    }

    /** 첫 페이지 — 어느 소스도 아직 읽지 않은 상태. */
    public static FeedCursor first() {
        return new FeedCursor(new EnumMap<>(FeedItemType.class));
    }

    public Position positionOf(FeedItemType type) {
        return positions.get(type);
    }

    /** 해당 소스의 커서 타임스탬프 (없으면 null → 쿼리에서 전체 조회). */
    public LocalDateTime createdAtOf(FeedItemType type) {
        Position p = positions.get(type);
        return p != null ? p.createdAt() : null;
    }

    public Long idOf(FeedItemType type) {
        Position p = positions.get(type);
        return p != null ? p.id() : null;
    }

    public String encode() {
        StringBuilder sb = new StringBuilder();
        positions.forEach((type, pos) -> {
            if (sb.length() > 0) {
                sb.append('|');
            }
            sb.append(type.name()).append(':')
                    .append(pos.createdAt().toEpochSecond(java.time.ZoneOffset.UTC))
                    .append('.').append(pos.createdAt().getNano())
                    .append(':').append(pos.id());
        });
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(sb.toString().getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 커서 문자열 복원.
     *
     * <p>해석에 실패하면 예외 대신 <b>첫 페이지</b>로 되돌린다. 배포 중 이전 형식의 커서를
     * 들고 있는 클라이언트가 스크롤 도중 에러를 만나는 것보다, 처음부터 다시 읽는 편이 낫다.
     */
    public static FeedCursor decode(String raw) {
        if (raw == null || raw.isBlank()) {
            return first();
        }
        try {
            String plain = new String(Base64.getUrlDecoder().decode(raw), StandardCharsets.UTF_8);
            Map<FeedItemType, Position> positions = new EnumMap<>(FeedItemType.class);
            for (String part : plain.split("\\|")) {
                if (part.isBlank()) {
                    continue;
                }
                String[] f = part.split(":");
                String[] ts = f[1].split("\\.");
                positions.put(
                        FeedItemType.valueOf(f[0]),
                        new Position(
                                LocalDateTime.ofEpochSecond(
                                        Long.parseLong(ts[0]), Integer.parseInt(ts[1]),
                                        java.time.ZoneOffset.UTC),
                                Long.parseLong(f[2])));
            }
            return new FeedCursor(positions);
        } catch (RuntimeException e) {
            log.warn("타임라인 커서 해석 실패 — 첫 페이지로 처리합니다: {}", e.getMessage());
            return first();
        }
    }
}
