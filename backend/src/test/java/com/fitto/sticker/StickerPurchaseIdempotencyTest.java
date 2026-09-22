package com.fitto.sticker;

import com.fitto.chat.domain.StickerPacks;
import com.fitto.common.plan.GooglePlayDeveloperApiClient;
import com.fitto.common.plan.StoreProductPurchase;
import com.fitto.sticker.domain.UserStickerPurchase;
import com.fitto.sticker.repository.UserStickerPurchaseRepository;
import com.fitto.sticker.service.StickerPurchaseService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;

/**
 * 같은 팩의 결제 검증이 <b>겹쳐 들어와도</b> 500 이 아니라 성공으로 끝나는가.
 *
 * <p>막는 사고는 이것이다 — 앱이 결제 후 검증을 두 번 보내면(연타·재시도·복원) 두 요청이
 * 모두 "아직 없다"를 보고 INSERT 로 간다. unique 인덱스가 뒤의 하나를 막는 건 맞지만,
 * <b>거기서 500 이 나가면 사용자는 "결제는 빠져나갔는데 에러"를 본다.</b> 팩은 이미 열려
 * 있으므로 그건 거짓 실패다.
 *
 * <p><b>왜 스파이로 찌르나</b>: 실제 사고는 두 스레드가 나란히 달릴 때 나는데, 그걸 그대로
 * 재현하면 타이밍에 기대는 깜빡이는 테스트가 된다. 대신 <b>먼저 들어온 요청이 이미 행을
 * 남긴 상태</b>를 만들고 조회만 "없다"로 눌러, 뒤 요청이 실제로 밟는 경로(중복 INSERT →
 * {@code DataIntegrityViolationException})를 결정적으로 태운다.
 *
 * <p>이 테스트는 {@code StickerPurchaseService.verifyGoogle} 에 {@code @Transactional} 이
 * 붙어 있으면 <b>실패한다</b>. IDENTITY 채번이라 {@code save()} 가 즉시 INSERT 를 날리고,
 * 위반이 나면 Hibernate 가 트랜잭션을 rollback-only 로 표시하기 때문이다 — 예외를 잡아도
 * 커밋에서 {@code UnexpectedRollbackException} 이 뜬다. 그게 이 테스트가 지키는 것이다.
 *
 * <p><b>가입하지 않는다.</b> {@code user_sticker_purchases.user_id} 에는 FK 가 없고(V96)
 * 이 경로는 사용자 행을 읽지도 않으므로, 그냥 쓰지 않는 id 를 쓴다. 굳이 가입시키면
 * {@code AuthRateLimiter.checkRegister}(IP 기준 시간당 한도) 카운트를 같은 컨텍스트를
 * 공유하는 다른 테스트와 나눠 쓰게 되어, 무관한 클래스가 429 로 무너진다 — 실제로 그렇게
 * 깨뜨려 보고 되돌린 결정이다.
 */
@SpringBootTest(properties = {
        "fitto.plan.free-trial=false",
        "fitto.plan.trial-days=0"})
@ActiveProfiles("test")
class StickerPurchaseIdempotencyTest {

    private static final String PACK = StickerPacks.MOOD_PREMIUM;
    private static final String PRODUCT_ID = "sticker_pack_mood_premium";

    /** 가입 없이 쓰는 합성 id — 다른 테스트와 겹치지 않게 멀리 떨어뜨린다 */
    private static final long USER_DUP = 990_001L;
    private static final long USER_REPLAY = 990_002L;

    @Autowired StickerPurchaseService purchaseService;

    /** 실제 빈을 감싼다 — 저장은 진짜 DB 로 가고, 조회만 눌러 중복 경로를 만든다 */
    @MockitoSpyBean UserStickerPurchaseRepository purchaseRepository;
    /** 스토어 키가 없는 테스트 환경에서는 실제 클라이언트가 null 을 돌려준다 */
    @MockitoBean GooglePlayDeveloperApiClient googlePlayClient;

    @Test
    void 검증이_겹쳐_들어와도_성공으로_끝나고_행은_하나다() {
        when(googlePlayClient.fetchProduct(anyString(), anyString()))
                .thenReturn(new StoreProductPurchase(PRODUCT_ID, USER_DUP, true));

        // 먼저 들어온 검증이 이미 행을 남겼다
        purchaseRepository.save(UserStickerPurchase.builder()
                .userId(USER_DUP).stickerPackId(PACK).transactionId("tx-first").build());

        // 뒤 요청은 그 행을 아직 못 본다 — 실제 동시 요청이 겪는 상태
        doReturn(Optional.empty()).when(purchaseRepository).findByUserIdAndStickerPackId(USER_DUP, PACK);

        assertThatCode(() -> purchaseService.verifyGoogle(USER_DUP, PACK, "purchase-token"))
                .doesNotThrowAnyException();

        // 스텁을 건 건 finder 하나뿐이라 나머지는 실제 빈으로 내려간다 — 두 줄이 되면 안 된다
        assertThat(purchaseRepository.findPackIdsByUserIds(List.of(USER_DUP)))
                .containsExactly(PACK);
    }

    @Test
    void 같은_요청을_두_번_보내도_멱등이다() {
        when(googlePlayClient.fetchProduct(anyString(), anyString()))
                .thenReturn(new StoreProductPurchase(PRODUCT_ID, USER_REPLAY, true));

        purchaseService.verifyGoogle(USER_REPLAY, PACK, "purchase-token");
        assertThatCode(() -> purchaseService.verifyGoogle(USER_REPLAY, PACK, "purchase-token"))
                .doesNotThrowAnyException();

        assertThat(purchaseRepository.findPackIdsByUserIds(List.of(USER_REPLAY))).containsExactly(PACK);
    }
}
