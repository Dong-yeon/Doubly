package com.fitto.journal.service;

import com.fitto.common.analytics.AnalyticsEvent;
import com.fitto.common.analytics.EventLogService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.time.KstClock;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.common.upload.CloudinaryProperties;
import com.fitto.common.upload.CloudinarySigner;
import com.fitto.common.upload.UploadSignatureResponse;
import com.fitto.journal.domain.JournalEntry;
import com.fitto.journal.domain.JournalSource;
import com.fitto.journal.dto.JournalEntryResponse;
import com.fitto.journal.dto.SaveJournalRequest;
import com.fitto.journal.repository.JournalEntryRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * 나만의 하루 기록 — docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §1·§2·§5.
 *
 * <p><b>모든 메서드가 토큰의 사용자 id 하나로만 동작한다.</b> 남의 기록을 가리킬 인자가 없으니
 * "남의 id 를 넣어 보는" 경로가 생기지 않는다(§2-2). 이 서비스는 알림·실시간 이벤트·피드·AI 어디에도
 * 기록을 넘기지 않는다 — 상대 화면이 "뭔가 바뀌었다"는 것조차 알게 하지 않는다(§2-1). 상대에게 닿는 유일한
 * 출구는 사용자가 직접 누르는 공유({@link JournalShareService})이고, 그것도 독립된 복사본만 만든다.
 */
@Service
public class JournalService {

    /** Cloudinary 하위 폴더 — 이 폴더의 URL 만 받는다(아무 URL 이나 받으면 남의 사진 주소를 붙일 수 있다) */
    static final String PHOTO_SUBFOLDER = "journal";

    private final JournalEntryRepository repository;
    private final PlanGuard planGuard;
    private final EventLogService eventLogService;
    private final CloudinaryProperties cloudinaryProperties;
    private final CloudinaryImageDeleter imageDeleter;
    private final TransactionTemplate tx;

    public JournalService(JournalEntryRepository repository, PlanGuard planGuard, EventLogService eventLogService,
                          CloudinaryProperties cloudinaryProperties, CloudinaryImageDeleter imageDeleter,
                          PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.planGuard = planGuard;
        this.eventLogService = eventLogService;
        this.cloudinaryProperties = cloudinaryProperties;
        this.imageDeleter = imageDeleter;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** 한 달 기록 — 달력과 목록이 같이 쓴다. 밑바탕은 조립하지 않는다(2차, §3-2) */
    @Transactional(readOnly = true)
    public List<JournalEntryResponse> month(Long userId, String month) {
        YearMonth ym;
        try {
            ym = YearMonth.parse(month);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "달은 2026-10 형식으로 보내주세요.");
        }
        return repository.findByUserIdAndJournalDateBetweenOrderByJournalDateAsc(
                        userId, ym.atDay(1), ym.atEndOfMonth())
                .stream().map(JournalEntryResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public JournalEntryResponse day(Long userId, LocalDate date) {
        return repository.findByUserIdAndJournalDate(userId, date)
                .map(JournalEntryResponse::from)
                .orElseThrow(() -> new BusinessException(ErrorCode.JOURNAL_NOT_FOUND));
    }

    /**
     * 그날 기록을 통째로 저장한다 — 없으면 만들고 있으면 바꾼다.
     *
     * <p><b>{@code ON CONFLICT} 를 쓸 수 없다</b>(H2 와 공통 문법, CLAUDE.md 4절). 찾아서 없으면 넣는데,
     * 같은 날짜로 두 요청이 동시에 오면 둘 다 "없다"를 보고 넣으려 한다. 늦은 쪽은 유니크에 막히므로
     * 새 트랜잭션에서 한 번 더 — 이번엔 먼저 들어간 행을 찾아 바꾼다. 같은 트랜잭션 안에서 다시 시도하면
     * 이미 롤백 표시가 붙어 있어 안 된다.
     */
    public JournalEntryResponse save(Long userId, LocalDate date, SaveJournalRequest request) {
        if (date.isAfter(KstClock.today())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "아직 오지 않은 날은 쓸 수 없어요.");
        }
        String mood = blankToNull(request.moodEmoji());
        String body = blankToNull(request.body());
        String photo = blankToNull(request.photoUrl());
        if (mood == null && body == null && photo == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "기분이나 한 줄 중 하나는 남겨 주세요.");
        }
        if (photo != null && !isJournalPhotoUrl(photo)) {
            throw new BusinessException(ErrorCode.INVALID_PHOTO_URL, "기록 화면에서 올린 사진만 붙일 수 있어요.");
        }

        Saved saved;
        try {
            saved = tx.execute(status -> upsert(userId, date, mood, body, photo));
        } catch (DataIntegrityViolationException raced) {
            saved = tx.execute(status -> upsert(userId, date, mood, body, photo));
        }

        // 계측은 커밋이 확정된 뒤에 한 번만 — 경합으로 다시 시도한 저장을 두 번 세지 않는다.
        // 본문·무드·사진은 절대 싣지 않는다(event_logs 는 탈퇴해도 남는다). 입구와 신규 여부만.
        if (saved.created()) {
            // 게이트가 아니라 계측이다(JOURNAL 은 무제한) — COUPLE_GAME 과 같은 이유로 FEATURE_USED 를 남긴다
            planGuard.require(userId, Feature.JOURNAL);
        }
        JournalSource source = request.source() != null ? request.source() : JournalSource.JOURNAL_LIST;
        eventLogService.log(userId, AnalyticsEvent.JOURNAL_SAVED,
                source.name() + (saved.created() ? ":NEW" : ":EDIT"));
        return saved.response();
    }

    private record Saved(JournalEntryResponse response, boolean created) {
    }

    private Saved upsert(Long userId, LocalDate date, String mood, String body, String photo) {
        var existing = repository.findByUserIdAndJournalDate(userId, date);
        if (existing.isPresent()) {
            JournalEntry entry = existing.get();
            String oldPhoto = entry.getPhotoUrl();
            entry.replace(mood, body, photo);
            repository.flush();
            if (oldPhoto != null && !oldPhoto.equals(photo)) {
                // 교체·제거된 사진 — 커밋이 확정된 뒤에 지운다(롤백되면 기록은 옛 사진을 가리킨 채 남는다)
                imageDeleter.deleteAllAfterCommit(List.of(oldPhoto));
            }
            return new Saved(JournalEntryResponse.from(entry), false);
        }
        JournalEntry created = repository.saveAndFlush(JournalEntry.builder()
                .userId(userId).journalDate(date).moodEmoji(mood).body(body).photoUrl(photo)
                .build());
        return new Saved(JournalEntryResponse.from(created), true);
    }

    @Transactional
    public void delete(Long userId, LocalDate date) {
        JournalEntry entry = repository.findByUserIdAndJournalDate(userId, date)
                .orElseThrow(() -> new BusinessException(ErrorCode.JOURNAL_NOT_FOUND));
        repository.delete(entry);
        if (entry.getPhotoUrl() != null) {
            imageDeleter.deleteAllAfterCommit(List.of(entry.getPhotoUrl()));
        }
    }

    /**
     * 기록 사진 업로드 서명 — 전용 폴더로, 사람 단위 {@code JOURNAL_PHOTO} 에서 센다.
     *
     * <p>커플 공용 {@code PHOTO_UPLOAD} 에서 세지 않는 이유: 매일 사진을 붙이는 사람이 커플 무료 한도
     * 60장의 절반을 먹고, 상대가 피드에서 402 를 만난다. 개인 기록이 커플 몫을 깎으면 안 된다(분석 §5-1).
     */
    public UploadSignatureResponse photoSignature(Long userId) {
        // 설정 확인이 먼저다 — 기능이 꺼져 있는데 한도를 깎으면 안 된다(UploadController 와 같은 순서)
        if (!cloudinaryProperties.isConfigured()) {
            throw new BusinessException(ErrorCode.UPLOAD_NOT_CONFIGURED);
        }
        planGuard.consume(userId, Feature.JOURNAL_PHOTO);
        return CloudinarySigner.sign(cloudinaryProperties, photoFolder());
    }

    private String photoFolder() {
        return cloudinaryProperties.getFolder() + "/" + PHOTO_SUBFOLDER;
    }

    /**
     * 전용 폴더에 올라간 Cloudinary URL 인가 — {@code CoupleEmojiService.isSourceUrl} 과 같은 검사.
     * 서명해 올린 URL 에는 상위 경로·쿼리·프래그먼트가 없으니 그런 문자가 보이면 그냥 거절한다.
     */
    boolean isJournalPhotoUrl(String url) {
        if (url.contains("..") || url.contains("?") || url.contains("#")) {
            return false;
        }
        String publicId = imageDeleter.extractPublicId(url);
        return publicId != null && publicId.startsWith(photoFolder() + "/");
    }

    private static String blankToNull(String s) {
        if (s == null) {
            return null;
        }
        String stripped = s.strip();
        return stripped.isEmpty() ? null : stripped;
    }
}
