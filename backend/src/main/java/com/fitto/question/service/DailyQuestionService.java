package com.fitto.question.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationService;
import com.fitto.question.domain.DailyAnswer;
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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 데일리 질문 (커플 Q&A) — 매일 질문에 둘 다 답하면 서로 공개.
 * 질문은 날짜로 결정되는 고정 목록(둘에게 같은 질문).
 */
@Service
@Transactional(readOnly = true)
public class DailyQuestionService {

    private static final List<String> QUESTIONS = List.of(
            "오늘 상대에게 가장 고마웠던 순간은?",
            "우리가 처음 만난 날, 기억나는 첫인상은?",
            "요즘 상대의 어떤 점이 제일 사랑스러워?",
            "함께 꼭 가보고 싶은 여행지는?",
            "상대가 해준 음식 중 최고는?",
            "5년 뒤 우리는 어떤 모습일까?",
            "오늘 하루 어땠어? 제일 힘들었던 건?",
            "상대에게 배우고 싶은 습관이 있다면?",
            "우리만의 특별한 추억 하나를 꼽는다면?",
            "지금 가장 하고 싶은 데이트는?",
            "상대의 어떤 말이 제일 힘이 돼?",
            "요즘 나의 가장 큰 고민은?",
            "함께 도전해보고 싶은 운동이나 취미는?",
            "상대에게 미안했던 순간이 있다면?",
            "우리가 더 자주 하면 좋겠는 것은?",
            "오늘 자신에게 100점 만점에 몇 점? 이유는?",
            "상대의 웃는 모습 중 언제가 제일 좋아?",
            "함께 이루고 싶은 올해의 목표는?",
            "요즘 빠져 있는 것은?",
            "상대가 아프면 제일 해주고 싶은 건?",
            "우리 관계에서 가장 소중하게 지키고 싶은 건?",
            "최근에 상대 덕분에 행복했던 일은?",
            "서로에게 별명을 지어준다면?",
            "지금 이 순간 상대에게 하고 싶은 한마디는?",
            "함께 늙어간다면 어떤 커플이 되고 싶어?",
            "요즘 먹고 싶은 음식, 같이 먹으러 갈래?",
            "상대의 장점 세 가지만 말한다면?",
            "가장 최근에 크게 웃었던 순간은?",
            "우리가 처음 손잡은 날 기억나?",
            "오늘 상대에게 주고 싶은 선물이 있다면?"
    );

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

    static String questionFor(LocalDate date) {
        int idx = (int) Math.floorMod(date.toEpochDay(), QUESTIONS.size());
        return QUESTIONS.get(idx);
    }

    public DailyQuestionResponse today(Long userId) {
        Relation couple = activeCouple(userId);
        Long partnerId = couple.partnerOf(userId);
        LocalDate today = LocalDate.now();
        String question = questionFor(today);

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
        LocalDate today = LocalDate.now();
        String question = questionFor(today);

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
            notificationService.notify(partnerId, "오늘의 질문",
                    userName(userId) + "님이 답했어요. 답하면 서로 볼 수 있어요!");
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
