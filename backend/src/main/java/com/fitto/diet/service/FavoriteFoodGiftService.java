package com.fitto.diet.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.diet.domain.FavoriteFood;
import com.fitto.diet.domain.FavoriteFoodGift;
import com.fitto.diet.domain.FavoriteFoodGiftItem;
import com.fitto.diet.domain.FavoriteFoodGiftStatus;
import com.fitto.diet.domain.FavoriteFoodItem;
import com.fitto.diet.dto.FavoriteFoodGiftResponse;
import com.fitto.diet.repository.FavoriteFoodGiftRepository;
import com.fitto.diet.repository.FavoriteFoodRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * 즐겨찾기 음식 공유 — 내 즐겨찾기 세트를 애인에게 보내고, 애인이 수락하면 애인 즐겨찾기
 * 목록에 그대로 추가된다. 운동 루틴 선물(RoutineGiftService)과 같은 골격이지만, 즐겨찾기는
 * 항목이 가볍고(자유 텍스트+칼로리) "시스템 템플릿" 같은 주인 없는 행 개념이 없어 별도
 * favorite_foods 스냅샷 행을 만들지 않고, 선물 엔티티가 항목 스냅샷을 직접 들고 있는다.
 */
@Service
@Transactional(readOnly = true)
public class FavoriteFoodGiftService {

    private static final int GIFT_PAGE_SIZE = 30;

    private final FavoriteFoodGiftRepository giftRepository;
    private final FavoriteFoodRepository favoriteFoodRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final PlanGuard planGuard;

    public FavoriteFoodGiftService(FavoriteFoodGiftRepository giftRepository,
                                   FavoriteFoodRepository favoriteFoodRepository,
                                   RelationRepository relationRepository,
                                   UserRepository userRepository,
                                   NotificationService notificationService,
                                   CoupleEventPublisher coupleEventPublisher,
                                   PlanGuard planGuard) {
        this.giftRepository = giftRepository;
        this.favoriteFoodRepository = favoriteFoodRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.planGuard = planGuard;
    }

    /** 내 즐겨찾기 세트를 애인에게 선물 — 전송 즉시 항목을 스냅샷으로 떠 원본과 분리한다. */
    @Transactional
    public FavoriteFoodGiftResponse send(Long senderId, Long favoriteFoodId, String message) {
        FavoriteFood source = favoriteFoodRepository.findByIdAndUserId(favoriteFoodId, senderId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "즐겨찾기를 찾을 수 없습니다."));
        Relation relation = activeCoupleRelation(senderId);
        Long receiverId = relation.partnerOf(senderId);

        FavoriteFoodGift gift = FavoriteFoodGift.builder()
                .relationId(relation.getId())
                .senderId(senderId)
                .receiverId(receiverId)
                .name(source.getName())
                .message(trimToNull(message))
                .build();
        for (FavoriteFoodItem item : source.getItems()) {
            gift.addItem(FavoriteFoodGiftItem.builder()
                    .name(item.getName())
                    .calories(item.getCalories())
                    .carbs(item.getCarbs())
                    .protein(item.getProtein())
                    .fat(item.getFat())
                    .orderNo(item.getOrderNo())
                    .build());
        }
        giftRepository.save(gift);

        String senderName = userName(senderId);
        notificationService.notify(receiverId, NotificationCategory.PARTNER,
                "즐겨찾기 음식을 공유했어요 🍽️", senderName + " — " + source.getName(), PushLinks.DIET);
        coupleEventPublisher.publish(relation.getId(), CoupleEvent.FAVORITE_FOOD_GIFT);
        return FavoriteFoodGiftResponse.of(gift, senderName, userName(receiverId));
    }

    /** 받은 선물 목록 — 최근 순 (PENDING 도 ACCEPTED/DECLINED 도 함께 보여준다) */
    public List<FavoriteFoodGiftResponse> received(Long userId) {
        return toResponses(giftRepository.findByReceiverIdOrderByIdDesc(userId, PageRequest.of(0, GIFT_PAGE_SIZE)));
    }

    /** 보낸 선물 목록 — 최근 순 */
    public List<FavoriteFoodGiftResponse> sent(Long userId) {
        return toResponses(giftRepository.findBySenderIdOrderByIdDesc(userId, PageRequest.of(0, GIFT_PAGE_SIZE)));
    }

    /**
     * 수락 — 스냅샷 항목을 내 소유 즐겨찾기로 복사한다. 이름이 이미 있으면(FavoriteFoodService.save
     * 와 같은 중복 방지 규칙) 뒤에 번호를 붙여 항상 수락은 성공하게 한다 — 이름 충돌 때문에
     * 선물 수락이 막히면 이상하다.
     */
    @Transactional
    public FavoriteFoodGiftResponse accept(Long receiverId, Long giftId) {
        FavoriteFoodGift gift = getReceivable(receiverId, giftId);
        requireActiveRelation(gift.getRelationId());

        planGuard.requireCapacity(receiverId, Feature.FAVORITE_FOOD, favoriteFoodRepository.countByUserId(receiverId));
        FavoriteFood favorite = FavoriteFood.builder()
                .userId(receiverId)
                .name(uniqueName(receiverId, gift.getName()))
                .build();
        for (FavoriteFoodGiftItem item : gift.getItems()) {
            favorite.addItem(FavoriteFoodItem.builder()
                    .name(item.getName())
                    .calories(item.getCalories())
                    .carbs(item.getCarbs())
                    .protein(item.getProtein())
                    .fat(item.getFat())
                    .orderNo(item.getOrderNo())
                    .build());
        }
        favoriteFoodRepository.save(favorite);

        gift.accept(favorite.getId());
        String receiverName = userName(receiverId);
        notificationService.notify(gift.getSenderId(), NotificationCategory.PARTNER,
                "즐겨찾기를 받았어요!", receiverName + "님이 선물을 받았어요 🍽️", PushLinks.DIET);
        coupleEventPublisher.publish(gift.getRelationId(), CoupleEvent.FAVORITE_FOOD_GIFT);
        return FavoriteFoodGiftResponse.of(gift, userName(gift.getSenderId()), receiverName);
    }

    /**
     * 거절 — 상태만 바꾼다. 보낸 사람에게는 알리지 않는다: 커플 사이에서 "거절당했다" 푸시는
     * 불필요한 마찰을 만들 수 있어, 보낸 사람은 "보낸 선물" 목록에서 상태로만 확인한다.
     */
    @Transactional
    public void decline(Long receiverId, Long giftId) {
        getReceivable(receiverId, giftId).decline();
    }

    // ---- helpers ----

    private Relation activeCoupleRelation(Long userId) {
        return relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream()
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_ACTIVE, "연결된 애인이 없어요."));
    }

    /**
     * 관계가 끊긴 뒤에도 PENDING 선물이 남아있을 수 있다 — Relation.involves() 만으로는
     * 종료 후 접근을 막지 못하므로(Relation.isActive() 주석 참고) 반드시 별도로 확인한다.
     */
    private void requireActiveRelation(Long relationId) {
        Relation relation = relationRepository.findById(relationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        if (!relation.isActive()) {
            throw new BusinessException(ErrorCode.RELATION_NOT_ACTIVE);
        }
    }

    private FavoriteFoodGift getReceivable(Long receiverId, Long giftId) {
        FavoriteFoodGift gift = giftRepository.findByIdAndReceiverId(giftId, receiverId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GIFT_NOT_FOUND));
        if (gift.getStatus() != FavoriteFoodGiftStatus.PENDING) {
            throw new BusinessException(ErrorCode.GIFT_ALREADY_RESPONDED);
        }
        return gift;
    }

    private String uniqueName(Long userId, String baseName) {
        String name = baseName;
        int suffix = 2;
        while (favoriteFoodRepository.existsByUserIdAndName(userId, name)) {
            name = baseName + " (" + suffix + ")";
            suffix++;
        }
        return name;
    }

    /** 상대 이름을 배치 조회로 한 번에 채운다 (N+1 방지) — 항목 스냅샷은 이미 gift 에 들어있어 별도 조회가 없다. */
    private List<FavoriteFoodGiftResponse> toResponses(List<FavoriteFoodGift> gifts) {
        if (gifts.isEmpty()) {
            return List.of();
        }
        List<Long> userIds = gifts.stream()
                .flatMap(g -> Stream.of(g.getSenderId(), g.getReceiverId()))
                .distinct()
                .toList();
        Map<Long, String> names = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName));
        return gifts.stream()
                .map(g -> FavoriteFoodGiftResponse.of(g, names.get(g.getSenderId()), names.get(g.getReceiverId())))
                .toList();
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("애인");
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
