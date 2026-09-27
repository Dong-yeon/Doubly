package com.fitto.question.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.notification.NotificationService;
import com.fitto.question.domain.DailyAnswer;
import com.fitto.question.domain.QuestionCatalog;
import com.fitto.question.dto.AnswerRequest;
import com.fitto.question.dto.DailyQuestionResponse;
import com.fitto.question.dto.PendingQuestionResponse;
import com.fitto.question.dto.QuestionHistoryResponse;
import com.fitto.question.repository.DailyAnswerRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import com.fitto.common.time.KstClock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 데일리 질문 (커플 Q&A) — 매일 질문에 둘 다 답하면 서로 공개.
 * 질문 문구는 {@link QuestionCatalog} 가 날짜로 결정한다(둘에게 같은 질문).
 *
 * <p><b>한쪽만 답한 질문은 날이 바뀌어도 남는다(2026-09-27).</b> 예전엔 오늘 화면이 오늘 날짜만,
 * 히스토리가 둘 다 답한 날만 보여 줘서, 상대가 답한 날을 내가 넘기면 그 답은 DB 에만 남고
 * 어디서도 볼 수 없는 데이터가 됐다. 이제 그런 날은 {@link #pending} 으로 남은 사람에게
 * 계속 보이고, {@link #answer} 가 그 날짜로 답을 받는다 — 답하는 순간 히스토리로 옮겨 간다.
 * 둘 다 안 답한 지난 날은 되살리지 않는다(기다리는 사람이 없는 질문이다).
 */
@Service
@Transactional(readOnly = true)
public class DailyQuestionService {

    private final DailyAnswerRepository answerRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;

    public DailyQuestionService(DailyAnswerRepository answerRepository,
                                RelationRepository relationRepository,
                                UserRepository userRepository,
                                NotificationService notificationService,
                                CoupleEventPublisher coupleEventPublisher) {
        this.answerRepository = answerRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    public DailyQuestionResponse today(Long userId) {
        Relation couple = activeCouple(userId);
        LocalDate today = KstClock.today();
        return view(couple, userId, today, QuestionCatalog.questionFor(today));
    }

    /** 답을 기다리는 지난 질문(최근순) — 상대가 답했고 내가 아직 안 한 날. 상대 답은 숨긴다. */
    public List<PendingQuestionResponse> pending(Long userId) {
        Relation couple = activeCouple(userId);
        Long partnerId = couple.partnerOf(userId);
        if (partnerId == null) {
            return List.of();
        }
        String partnerName = userName(partnerId);
        return answerRepository.findAwaitingAnswer(couple.getId(), partnerId, userId, KstClock.today())
                .stream()
                .map(a -> new PendingQuestionResponse(a.getQuestionDate(), a.getQuestionText(), partnerName))
                .toList();
    }

    /** 한 날짜의 질문을 내 시점으로 — 상대 답은 내가 답한 뒤에만 공개 */
    private DailyQuestionResponse view(Relation couple, Long userId, LocalDate date, String question) {
        Long partnerId = couple.partnerOf(userId);
        String myAnswer = answerRepository
                .findByCoupleIdAndQuestionDateAndUserId(couple.getId(), date, userId)
                .map(DailyAnswer::getAnswer).orElse(null);
        String partnerAnswerRaw = partnerId == null ? null : answerRepository
                .findByCoupleIdAndQuestionDateAndUserId(couple.getId(), date, partnerId)
                .map(DailyAnswer::getAnswer).orElse(null);

        boolean bothAnswered = myAnswer != null && partnerAnswerRaw != null;
        String partnerAnswer = myAnswer != null ? partnerAnswerRaw : null;
        String partnerName = partnerId != null ? userName(partnerId) : null;
        return new DailyQuestionResponse(date, question, myAnswer, partnerAnswer, partnerName, bothAnswered);
    }

    @Transactional
    public DailyQuestionResponse answer(Long userId, AnswerRequest req) {
        Relation couple = activeCouple(userId);
        LocalDate today = KstClock.today();
        LocalDate date = req.questionDate();
        if (date != null && !date.equals(today)) {
            return answerPast(couple, userId, date, today, req.answer().trim());
        }
        String question = QuestionCatalog.questionFor(today);

        DailyAnswer existing = answerRepository
                .findByCoupleIdAndQuestionDateAndUserId(couple.getId(), today, userId).orElse(null);
        if (existing != null) {
            existing.updateAnswer(req.answer().trim());
        } else {
            answerRepository.save(DailyAnswer.builder()
                    .coupleId(couple.getId())
                    .questionDate(today)
                    .userId(userId)
                    .questionText(question)
                    .answer(req.answer().trim())
                    .build());
        }

        Long partnerId = couple.partnerOf(userId);
        if (partnerId != null && existing == null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "오늘의 질문",
                    userName(userId) + "님이 답했어요. 답하면 서로 볼 수 있어요!", PushLinks.QUESTION);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.QUESTION);
        return today(userId);
    }

    /**
     * 지난 질문에 답한다 — {@link #pending} 에 뜨는 날만 된다(상대가 답했고 나는 아직).
     *
     * <p>둘 다 안 답한 지난 날, 이미 답한 지난 날(수정)은 받지 않는다. 지난 날의 답을 고치게 두면
     * 상대가 이미 읽은 답이 바뀐다 — 오늘 질문의 수정과 달리 상대는 그걸 알 길이 없다.
     * 질문 문구는 카탈로그가 아니라 <b>상대 행의 스냅샷</b>을 쓴다(카탈로그 순서가 바뀌었어도
     * 상대가 답한 그 질문이어야 한다).
     */
    private DailyQuestionResponse answerPast(Relation couple, Long userId, LocalDate date, LocalDate today,
                                             String answer) {
        if (date.isAfter(today)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "아직 열리지 않은 질문이에요.");
        }
        Long partnerId = couple.partnerOf(userId);
        DailyAnswer partnerRow = partnerId == null ? null : answerRepository
                .findByCoupleIdAndQuestionDateAndUserId(couple.getId(), date, partnerId).orElse(null);
        if (partnerRow == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "지난 질문은 상대가 먼저 답한 것만 답할 수 있어요.");
        }
        if (answerRepository.findByCoupleIdAndQuestionDateAndUserId(couple.getId(), date, userId).isPresent()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이미 답한 질문이에요.");
        }
        answerRepository.save(DailyAnswer.builder()
                .coupleId(couple.getId())
                .questionDate(date)
                .userId(userId)
                .questionText(partnerRow.getQuestionText())
                .answer(answer)
                .build());

        // 기다리던 사람은 상대 — 이제 서로 공개됐다는 걸 알린다
        notificationService.notify(partnerId, NotificationCategory.PARTNER, "오늘의 질문",
                userName(userId) + "님이 지난 질문에 답했어요. 이제 서로의 답을 볼 수 있어요!", PushLinks.QUESTION);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.QUESTION);
        return view(couple, userId, date, partnerRow.getQuestionText());
    }

    /** 지난 Q&A — 양쪽 다 답한 날짜만 (최근순) */
    public List<QuestionHistoryResponse> history(Long userId) {
        Relation couple = activeCouple(userId);
        Long partnerId = couple.partnerOf(userId);
        if (partnerId == null) {
            return List.of();
        }
        List<DailyAnswer> all = answerRepository.findByCoupleIdOrderByQuestionDateDesc(couple.getId());
        List<QuestionHistoryResponse> result = new ArrayList<>();
        LocalDate lastDate = null;
        for (DailyAnswer a : all) {
            if (a.getQuestionDate().equals(lastDate)) continue; // 날짜당 한 번만 처리
            lastDate = a.getQuestionDate();
            String mine = answerRepository
                    .findByCoupleIdAndQuestionDateAndUserId(couple.getId(), a.getQuestionDate(), userId)
                    .map(DailyAnswer::getAnswer).orElse(null);
            String theirs = answerRepository
                    .findByCoupleIdAndQuestionDateAndUserId(couple.getId(), a.getQuestionDate(), partnerId)
                    .map(DailyAnswer::getAnswer).orElse(null);
            if (mine != null && theirs != null) {
                result.add(new QuestionHistoryResponse(a.getQuestionDate(), a.getQuestionText(), mine, theirs));
            }
        }
        return result;
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
