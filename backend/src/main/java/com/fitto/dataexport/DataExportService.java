package com.fitto.dataexport;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.FeatureState;
import com.fitto.common.plan.PlanGuard;
import com.fitto.dataexport.dto.ExportMedia;
import com.fitto.dataexport.dto.ExportPageResponse;
import com.fitto.dataexport.dto.ExportSummaryResponse;
import com.fitto.dataexport.dto.SectionCount;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Clob;
import java.sql.SQLException;
import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * 기록 내보내기 — 서버는 <b>목록만</b> 주고 파일은 앱이 Cloudinary 에서 직접 받아 ZIP 으로 묶는다
 * (docs/DATA_EXPORT_2026-10-01.md §1: 서버 ZIP 은 대역폭을 두 번 쓰고, 긴 요청이 Railway 에서
 * 끊기면 처음부터 다시다).
 *
 * <p><b>범위</b>: 지금 연결된(ACTIVE) 커플의 공동 기록 + 내 개인 기록. 끊긴(ENDED) 관계는
 * 이번에는 뺐다 — 헤어진 상대의 채팅·사진을 한쪽이 혼자 가져가는 것은 따로 판단할 문제이고,
 * 복원하면 다시 대상이 된다. 상대의 개인 기록(식단·운동)도 넣지 않는다.
 *
 * <p><b>한도</b>: {@link #start} 만 {@link Feature#CSV_EXPORT} 를 차감한다. 섹션 조회는 화면에서
 * 이미 볼 수 있는 내 기록을 다시 읽는 것이라 세지 않는다 — 그래야 끊긴 내보내기를 이어받을 때
 * 횟수가 또 빠지지 않는다.
 */
@Service
public class DataExportService {

    static final int DEFAULT_LIMIT = 200;
    static final int MAX_LIMIT = 500;

    /*
     * 예상 용량 — 파일 크기는 Cloudinary 에만 있어 미리 알 수 없다. 사진은 앱이 긴 변 1024px
     * JPEG q0.8 로 줄여 올리므로(imageUpload.ts shrinkImage) 장당 250KB 안팎, 음성은 30초 이하.
     * "남은 저장공간이 충분한가"를 가르는 용도라 넉넉한 쪽으로 잡는다.
     */
    static final long AVG_IMAGE_BYTES = 300_000;
    static final long AVG_AUDIO_BYTES = 150_000;

    private final NamedParameterJdbcTemplate jdbc;
    private final RelationRepository relationRepository;
    private final PlanGuard planGuard;

    public DataExportService(NamedParameterJdbcTemplate jdbc, RelationRepository relationRepository,
                             PlanGuard planGuard) {
        this.jdbc = jdbc;
        this.relationRepository = relationRepository;
        this.planGuard = planGuard;
    }

    /** 무엇이 몇 건인지 — 화면이 시작 전에 보여준다. 횟수를 쓰지 않는다. */
    @Transactional(readOnly = true)
    public ExportSummaryResponse summary(Long userId) {
        Optional<Long> relationId = activeCoupleId(userId);
        List<SectionCount> sections = new ArrayList<>();
        long images = 0;
        long audios = 0;
        for (ExportSection section : ExportSection.values()) {
            if (section.scope() == ExportSection.Scope.COUPLE && relationId.isEmpty()) {
                continue;
            }
            MapSqlParameterSource params = params(section, userId, relationId.orElse(null));
            long count = count("SELECT COUNT(*) FROM " + section.from(), params);
            long media = 0;
            for (String column : section.mediaColumns()) {
                long n = count("SELECT COUNT(t." + column + ") FROM " + section.from(), params);
                media += n;
                if (isAudio(column)) audios += n;
                else images += n;
            }
            if (section == ExportSection.CHAT_MESSAGES) {
                long voices = count("SELECT COUNT(*) FROM " + section.from()
                        + " AND t.message_type = 'VOICE_MESSAGE' AND t.content IS NOT NULL", params);
                media += voices;
                audios += voices;
            }
            sections.add(new SectionCount(section.key(), section.scope().name(), count, media));
        }
        FeatureState quota = planGuard.state(userId, Feature.CSV_EXPORT);
        return new ExportSummaryResponse(
                relationId.isPresent(), sections, images + audios,
                images * AVG_IMAGE_BYTES + audios * AVG_AUDIO_BYTES,
                quota.remaining(), quota.limit(), quota.period());
    }

    /**
     * 새 내보내기를 시작한다 — 여기서만 한 회를 쓴다. 넘기면 429(업셀 없음, PlanGuard.upsells).
     * 이어받기는 이걸 다시 부르지 않고 섹션 조회만 한다.
     */
    @Transactional
    public ExportSummaryResponse start(Long userId) {
        planGuard.consume(userId, Feature.CSV_EXPORT);
        return summary(userId);
    }

    /** 섹션 한 페이지 — id 오름차순 keyset. */
    @Transactional(readOnly = true)
    public ExportPageResponse page(Long userId, String sectionKey, Long cursor, Integer limit) {
        ExportSection section = parse(sectionKey);
        Long relationId = null;
        if (section.scope() == ExportSection.Scope.COUPLE) {
            relationId = activeCoupleId(userId).orElseThrow(() -> new BusinessException(
                    ErrorCode.RELATION_NOT_FOUND, "커플 연결 후 받을 수 있는 기록이에요."));
        }
        int size = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(limit, MAX_LIMIT));
        MapSqlParameterSource params = params(section, userId, relationId)
                .addValue("cursor", cursor == null ? 0L : cursor)
                .addValue("lim", size + 1);
        String sql = "SELECT " + section.select() + " FROM " + section.from()
                + " AND t.id > :cursor ORDER BY t.id LIMIT :lim";
        List<Map<String, Object>> rows = jdbc.queryForList(sql, params);

        boolean more = rows.size() > size;
        List<Map<String, Object>> items = new ArrayList<>(Math.min(rows.size(), size));
        List<ExportMedia> media = new ArrayList<>();
        for (Map<String, Object> raw : more ? rows.subList(0, size) : rows) {
            Map<String, Object> row = normalize(raw);
            items.add(row);
            collectMedia(section, row, media);
        }
        Long next = more ? toLong(items.get(items.size() - 1).get("id")) : null;
        return new ExportPageResponse(section.key(), items, media, next);
    }

    private void collectMedia(ExportSection section, Map<String, Object> row, List<ExportMedia> out) {
        long rowId = toLong(row.get("id"));
        for (String column : section.mediaColumns()) {
            Object url = row.get(column);
            if (url instanceof String s && !s.isBlank()) {
                out.add(new ExportMedia(section.key(), rowId, column, s, isAudio(column) ? "AUDIO" : "IMAGE"));
            }
        }
        if (section == ExportSection.CHAT_MESSAGES && "VOICE_MESSAGE".equals(row.get("message_type"))) {
            String audio = voiceUrlOf(row.get("content"));
            if (audio != null) {
                out.add(new ExportMedia(section.key(), rowId, "content", audio, "AUDIO"));
            }
        }
    }

    /** 음성 메시지 본문은 {@code "{audioUrl}|{durationSec}"} 다 (MessageType.VOICE_MESSAGE). */
    static String voiceUrlOf(Object content) {
        if (!(content instanceof String s) || s.isBlank()) {
            return null;
        }
        int bar = s.lastIndexOf('|');
        String url = bar > 0 ? s.substring(0, bar) : s;
        return url.startsWith("http") ? url : null;
    }

    private static boolean isAudio(String column) {
        return column.startsWith("audio");
    }

    private ExportSection parse(String key) {
        try {
            return ExportSection.valueOf(key.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 내보내기 항목이에요.");
        }
    }

    private Optional<Long> activeCoupleId(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst().map(Relation::getId);
    }

    private static MapSqlParameterSource params(ExportSection section, Long userId, Long relationId) {
        MapSqlParameterSource params = new MapSqlParameterSource();
        if (section.scope() == ExportSection.Scope.COUPLE) {
            params.addValue("rid", relationId);
        } else {
            params.addValue("uid", userId);
        }
        return params;
    }

    private long count(String sql, MapSqlParameterSource params) {
        Long n = jdbc.queryForObject(sql, params, Long.class);
        return n == null ? 0 : n;
    }

    /**
     * 드라이버가 주는 값을 JSON 으로 옮기기 좋게 — 컬럼 이름은 소문자(H2 는 대문자로 준다),
     * 날짜·시각은 ISO 문자열(KST 벽시계 그대로), CLOB 은 문자열.
     */
    static Map<String, Object> normalize(Map<String, Object> raw) {
        Map<String, Object> row = new LinkedHashMap<>();
        raw.forEach((k, v) -> row.put(k.toLowerCase(Locale.ROOT), plain(v)));
        return row;
    }

    private static Object plain(Object v) {
        if (v == null) return null;
        if (v instanceof java.sql.Timestamp ts) return ts.toLocalDateTime().toString();
        if (v instanceof java.sql.Date d) return d.toLocalDate().toString();
        if (v instanceof java.sql.Time t) return t.toLocalTime().toString();
        if (v instanceof TemporalAccessor) return v.toString();
        if (v instanceof Clob clob) {
            try {
                return clob.getSubString(1, (int) clob.length());
            } catch (SQLException e) {
                return null;
            }
        }
        if (v instanceof byte[]) return null;
        return v;
    }

    private static long toLong(Object v) {
        return v instanceof Number n ? n.longValue() : Long.parseLong(String.valueOf(v));
    }
}
