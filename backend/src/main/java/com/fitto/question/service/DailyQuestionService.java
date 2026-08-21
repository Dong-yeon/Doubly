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
        Long partnerId = couple.partnerOf(userId);
        LocalDate today = KstClock.today();
        String question = QuestionCatalog.questionFor(today);

        String myAnswer = answerRepository
                .findByCoupleIdAndQuestionDateAndUserId(couple.getId(), today, userId)
                .map(DailyAnswer::getAnswer).orElse(null);
        String partnerAnswerRaw = partnerId == null ? null : answerRepository
                .findByCoupleIdAndQuestionDateAndUserId(couple.getId(), today, partnerId)
                .map(DailyAnswer::getAnswer).orElse(null);

        boolean bothAnswered = myAnswer != null && partnerAnswerRaw != null;
        // 상대 답은 내가 답한 뒤에만 공개
        String partnerAnswer = myAnswer != null ? partnerAnswerRaw : null;
        String partnerName = partnerId != null ? userName(partnerId) : null;
        return new DailyQuestionResponse(today, question, myAnswer, partnerAnswer, partnerName, bothAnswered);
    }

    @Transactional
    public DailyQuestionResponse answer(Long userId, AnswerRequest req) {
        Relation couple = activeCouple(userId);
        LocalDate today = KstClock.today();
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
