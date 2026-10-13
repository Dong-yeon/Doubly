package com.fitto.common.currency;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Store;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * 유료 재화 — 충전·지출·환불·회수의 단일 출처(docs/CURRENCY_EMOJI_2026-10-13.md).
 *
 * <p><b>결제로만 생긴다.</b> 게임·출석·광고로 주는 경로를 만들지 않는다(사용자 결정). 지갑은 개인이다.
 *
 * <p>모든 변경은 {@link CurrencyTx} 의 한 트랜잭션(지갑 조건부 UPDATE + 원장 INSERT)이고, 같은 일을 두 번 하지 않게
 * 하는 것은 원장의 {@code idempotency_key} UNIQUE 다. 이 클래스는 그 UNIQUE 위반을 "이미 처리됨"으로 바꾸는 바깥 층이다.
 */
@Service
public class CurrencyService {

    private static final Logger log = LoggerFactory.getLogger(CurrencyService.class);

    private final CurrencyTx tx;
    private final CurrencyWalletRepository walletRepository;
    private final CurrencyLedgerRepository ledgerRepository;
    private final CurrencyStorePurchaseRepository purchaseRepository;
    private final ShopItemRepository shopItemRepository;

    public CurrencyService(CurrencyTx tx, CurrencyWalletRepository walletRepository,
                           CurrencyLedgerRepository ledgerRepository,
                           CurrencyStorePurchaseRepository purchaseRepository,
                           ShopItemRepository shopItemRepository) {
        this.tx = tx;
        this.walletRepository = walletRepository;
        this.ledgerRepository = ledgerRepository;
        this.purchaseRepository = purchaseRepository;
        this.shopItemRepository = shopItemRepository;
    }

    /** 결제로 산 잔액 — 지갑이 없으면 0. 음수일 수 있다(환불 회수 빚). */
    public long balance(Long userId) {
        return walletRepository.findById(userId).map(CurrencyWallet::getPaidBalance).orElse(0L);
    }

    /** 앱 안 상품의 재화 가격 — 없거나 내렸으면 {@code SHOP_ITEM_UNAVAILABLE}. */
    public long priceOf(String shopItemId) {
        return shopItemRepository.findById(shopItemId)
                .filter(ShopItem::isActive)
                .map(ShopItem::getPrice)
                .orElseThrow(() -> new BusinessException(ErrorCode.SHOP_ITEM_UNAVAILABLE));
    }

    /**
     * 충전 — 검증을 마친 스토어 거래 하나를 지갑에 넣는다. 같은 거래가 다시 오면(재설치·연타·웹훅) 아무 일도 하지 않는다.
     *
     * @return 이번에 새로 넣었으면 {@code true}
     */
    public boolean grantPurchase(Long userId, Store store, String productId, String transactionId, long amount) {
        if (purchaseRepository.findByTransactionId(transactionId).isPresent()) {
            return false;
        }
        ensureWallet(userId);
        try {
            tx.grant(userId, store, productId, transactionId, amount);
            return true;
        } catch (DataIntegrityViolationException e) {
            log.debug("재화 충전 중복 — 이미 지급 (tx={}, userId={})", transactionId, userId);
            return false;
        }
    }

    /**
     * 지출 — 모자라면 {@code CURRENCY_INSUFFICIENT}(402). 같은 키로 다시 오면 다시 빼지 않는다(멱등).
     *
     * @param key 이 지출의 멱등 키 — 예: {@code spend:emoji:{userId}:{requestId}}. 환불은 이 키에서 만든다({@link #refundKey})
     */
    public void spend(Long userId, long amount, String refType, String refId, String key) {
        if (ledgerRepository.existsByIdempotencyKey(key)) {
            return;
        }
        ensureWallet(userId);
        try {
            tx.spend(userId, amount, refType, refId, key);
        } catch (DataIntegrityViolationException e) {
            // 같은 키가 동시에 두 번 — 뒤의 것은 뺀 잔액까지 되돌아갔다. 앞의 것이 이미 냈다.
            log.debug("재화 지출 중복 — 이미 차감 (key={})", key);
        }
    }

    /** 지출을 돌려준다 — 지출 키 하나에 환불 한 번. 지출이 없었으면(키 없음) 아무 일도 하지 않는다. */
    public void refundSpend(Long userId, long amount, String refType, String refId, String spendKey) {
        if (!ledgerRepository.existsByIdempotencyKey(spendKey)) {
            return;   // 빼지 않은 것을 돌려주지 않는다
        }
        String key = refundKey(spendKey);
        if (ledgerRepository.existsByIdempotencyKey(key)) {
            return;
        }
        ensureWallet(userId);
        try {
            tx.refund(userId, amount, refType, refId, key);
        } catch (DataIntegrityViolationException e) {
            log.debug("재화 환불 중복 — 이미 반환 (key={})", key);
        }
    }

    /** 스토어 환불 알림을 재확인한 뒤 부른다 — 우리가 준 거래가 아니거나 이미 회수했으면 {@code false}. */
    public boolean revokePurchase(String transactionId) {
        try {
            return tx.revoke(transactionId);
        } catch (DataIntegrityViolationException e) {
            log.debug("재화 회수 중복 — 이미 회수 (tx={})", transactionId);
            return false;
        }
    }

    /** 이 거래를 우리가 재화로 지급했는가 — 웹훅이 갈래를 고를 때. */
    public boolean isCurrencyPurchase(String transactionId) {
        return purchaseRepository.findByTransactionId(transactionId).isPresent();
    }

    static String refundKey(String spendKey) {
        return "refund:" + spendKey;
    }

    private void ensureWallet(Long userId) {
        if (walletRepository.existsById(userId)) {
            return;
        }
        try {
            tx.createWalletIfAbsent(userId);
        } catch (DataIntegrityViolationException e) {
            // 동시에 다른 요청이 만들었다 — 있으면 된다
        }
    }
}
