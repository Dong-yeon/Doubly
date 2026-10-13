package com.fitto.common.currency;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.CreditPurchaseVerifyRequest;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 유료 재화 API — 지갑·충전·앱 안 상품 카탈로그(docs/CURRENCY_EMOJI_2026-10-13.md).
 *
 * <p>충전 검증은 소모성 상품이라 웹훅이 반영 경로가 아니다 — <b>이 호출이 유일한 지급 경로</b>이고, 실패는 예외로 알린다
 * (크레딧·스티커와 같은 판단). 앱은 응답이 성공일 때만 스토어 트랜잭션을 닫는다.
 */
@RestController
@RequestMapping("/api/v1")
public class CurrencyController {

    private final CurrencyService currency;
    private final CurrencyPurchaseService purchaseService;
    private final ShopItemRepository shopItemRepository;

    public CurrencyController(CurrencyService currency, CurrencyPurchaseService purchaseService,
                              ShopItemRepository shopItemRepository) {
        this.currency = currency;
        this.purchaseService = purchaseService;
        this.shopItemRepository = shopItemRepository;
    }

    /** @param balance 결제로 산 잔액 — 음수면 환불 회수로 생긴 빚(충전 전엔 쓸 수 없다) */
    public record WalletResponse(long balance) {
    }

    /** @param price 재화 단위 */
    public record ShopItemResponse(String id, String itemType, long price) {
    }

    @GetMapping("/currency/wallet")
    public ApiResponse<WalletResponse> wallet(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(new WalletResponse(currency.balance(user.id())));
    }

    @PostMapping("/currency/purchases/google")
    public ApiResponse<WalletResponse> verifyGoogle(@AuthenticationPrincipal AuthUser user,
                                                    @RequestBody CreditPurchaseVerifyRequest request) {
        requireReceipt(request);
        purchaseService.verifyGoogle(user.id(), request.productId(), request.receipt());
        return ApiResponse.success(new WalletResponse(currency.balance(user.id())));
    }

    @PostMapping("/currency/purchases/apple")
    public ApiResponse<WalletResponse> verifyApple(@AuthenticationPrincipal AuthUser user,
                                                   @RequestBody CreditPurchaseVerifyRequest request) {
        requireReceipt(request);
        purchaseService.verifyApple(user.id(), request.productId(), request.receipt());
        return ApiResponse.success(new WalletResponse(currency.balance(user.id())));
    }

    @GetMapping("/shop/items")
    public ApiResponse<List<ShopItemResponse>> shopItems() {
        return ApiResponse.success(shopItemRepository.findAllByActiveTrueOrderByIdAsc().stream()
                .map(i -> new ShopItemResponse(i.getId(), i.getItemType(), i.getPrice()))
                .toList());
    }

    private static void requireReceipt(CreditPurchaseVerifyRequest request) {
        if (request == null || request.receipt() == null || request.receipt().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결제 정보가 없어요.");
        }
    }
}
