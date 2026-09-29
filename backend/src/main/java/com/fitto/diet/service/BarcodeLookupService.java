package com.fitto.diet.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.dto.BarcodeLookupResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * 바코드 → 영양정보. 출처를 차례로 내려간다(docs/BARCODE_LOOKUP_2026-09-29.md).
 *
 * <ol>
 *   <li><b>식품안전나라</b>로 제품(이름·업체·품목보고번호)을 찾고, <b>식약처 영양성분 DB</b>에서 그 제품의
 *       영양을 붙인다 — 국내 가공식품.</li>
 *   <li><b>Open Food Facts</b> — 수입·다이어트 식품.</li>
 *   <li>영양은 못 찾았지만 제품명은 알면 <b>제품명만</b> 돌려준다 — 앱이 이름을 보여 주며
 *       영양성분표 촬영(AI 분석의 NUTRITION_LABEL)을 권한다.</li>
 *   <li>아무것도 없으면 {@link ErrorCode#FOOD_DB_NOT_FOUND} — 앱은 역시 영양성분표 촬영으로 안내한다.</li>
 * </ol>
 *
 * <p>어느 단계에서 찾았는지 INFO 로그를 남긴다 — 출처별 적중률로 B·C 를 계속 둘지 판단하기 위해서다.
 */
@Service
public class BarcodeLookupService {

    private static final Logger log = LoggerFactory.getLogger(BarcodeLookupService.class);

    private final FoodSafetyBarcodeClient foodSafety;
    private final FoodDbClient foodDb;
    private final OpenFoodFactsClient openFoodFacts;

    public BarcodeLookupService(FoodSafetyBarcodeClient foodSafety, FoodDbClient foodDb,
                                OpenFoodFactsClient openFoodFacts) {
        this.foodSafety = foodSafety;
        this.foodDb = foodDb;
        this.openFoodFacts = openFoodFacts;
    }

    public BarcodeLookupResponse lookup(String rawBarcode) {
        String barcode = normalize(rawBarcode);
        if (!foodSafety.isConfigured() && !openFoodFacts.isEnabled()) {
            throw new BusinessException(ErrorCode.FOOD_DB_NOT_CONFIGURED);
        }

        BarcodeLookupResponse nameOnly = null;

        Optional<FoodSafetyBarcodeClient.Product> product = foodSafety.find(barcode);
        if (product.isPresent()) {
            FoodSafetyBarcodeClient.Product p = product.get();
            Optional<BarcodeLookupResponse> nutrition = foodDb.findForProduct(p.name(), p.maker(), p.reportNo());
            if (nutrition.isPresent() && nutrition.get().hasNutrition()) {
                log.info("바코드 {} → 식품안전나라+영양DB ({})", barcode, p.name());
                // 이름은 영양 DB 행("라면_신라면")보다 바코드 제품명이 사람이 읽기 좋다
                return nutrition.get().withBarcodeAndName(barcode, p.name());
            }
            nameOnly = BarcodeLookupResponse.nameOnly(barcode, p.name(), BarcodeLookupResponse.SOURCE_FOOD_DB);
        }

        Optional<BarcodeLookupResponse> off = openFoodFacts.find(barcode);
        if (off.isPresent() && off.get().hasNutrition()) {
            log.info("바코드 {} → Open Food Facts ({})", barcode, off.get().foodName());
            return off.get();
        }
        if (nameOnly == null && off.isPresent()) {
            nameOnly = BarcodeLookupResponse.nameOnly(barcode, off.get().foodName(),
                    BarcodeLookupResponse.SOURCE_OPEN_FOOD_FACTS);
        }

        if (nameOnly != null) {
            log.info("바코드 {} → 제품명만 ({})", barcode, nameOnly.foodName());
            return nameOnly;
        }
        log.info("바코드 {} → 못 찾음", barcode);
        throw new BusinessException(ErrorCode.FOOD_DB_NOT_FOUND);
    }

    /** 숫자만 — EAN-8·UPC-A(12)·EAN-13·GTIN-14. 그 밖은 바코드가 아니다(QR 등 오인식) */
    static String normalize(String raw) {
        String digits = raw == null ? "" : raw.replaceAll("\\D", "");
        if (digits.length() < 8 || digits.length() > 14) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "상품 바코드가 아닌 것 같아요.");
        }
        return digits;
    }
}
