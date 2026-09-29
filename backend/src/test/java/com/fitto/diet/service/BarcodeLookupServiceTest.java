package com.fitto.diet.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.dto.BarcodeLookupResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 바코드 출처를 내려가는 순서 — 스프링 컨텍스트 없이(컨텍스트 가짓수를 늘리지 않는다). */
class BarcodeLookupServiceTest {

    private static final String CODE = "8801043014809";

    private FoodSafetyBarcodeClient foodSafety;
    private FoodDbClient foodDb;
    private OpenFoodFactsClient off;
    private BarcodeLookupService service;

    @BeforeEach
    void setUp() {
        foodSafety = mock(FoodSafetyBarcodeClient.class);
        foodDb = mock(FoodDbClient.class);
        off = mock(OpenFoodFactsClient.class);
        when(foodSafety.isConfigured()).thenReturn(true);
        when(off.isEnabled()).thenReturn(true);
        when(foodSafety.find(any())).thenReturn(Optional.empty());
        when(foodDb.findForProduct(any(), any(), any())).thenReturn(Optional.empty());
        when(off.find(any())).thenReturn(Optional.empty());
        service = new BarcodeLookupService(foodSafety, foodDb, off);
    }

    private static BarcodeLookupResponse nutrition(String name, String source) {
        return new BarcodeLookupResponse("", name, "100g", 500, 70, 10, 16, 4, 1800, 3, source);
    }

    @Test
    void 식품안전나라에서_찾은_제품에_영양DB를_붙이고_이름은_제품명을_쓴다() {
        when(foodSafety.find(CODE)).thenReturn(Optional.of(
                new FoodSafetyBarcodeClient.Product("신라면", "농심", "19780614001123")));
        when(foodDb.findForProduct("신라면", "농심", "19780614001123"))
                .thenReturn(Optional.of(nutrition("라면_신라면", BarcodeLookupResponse.SOURCE_FOOD_DB)));

        BarcodeLookupResponse r = service.lookup(CODE);

        assertThat(r.barcode()).isEqualTo(CODE);
        assertThat(r.foodName()).isEqualTo("신라면");
        assertThat(r.calories()).isEqualTo(500);
        verify(off, never()).find(any());
    }

    @Test
    void 국내_DB에_없으면_Open_Food_Facts_로_간다() {
        when(off.find(CODE)).thenReturn(Optional.of(nutrition("Quest Protein Bar", "OPEN_FOOD_FACTS")));

        assertThat(service.lookup(CODE).source()).isEqualTo(BarcodeLookupResponse.SOURCE_OPEN_FOOD_FACTS);
    }

    @Test
    void 영양은_못_찾고_제품명만_알면_이름만_돌려준다() {
        when(foodSafety.find(CODE)).thenReturn(Optional.of(new FoodSafetyBarcodeClient.Product("닭가슴살 큐브", "허닭", null)));

        BarcodeLookupResponse r = service.lookup(CODE);

        assertThat(r.foodName()).isEqualTo("닭가슴살 큐브");
        assertThat(r.hasNutrition()).isFalse();
    }

    @Test
    void 아무데도_없으면_못_찾음이다() {
        assertThatThrownBy(() -> service.lookup(CODE))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FOOD_DB_NOT_FOUND);
    }

    @Test
    void 출처가_하나도_켜져_있지_않으면_준비_안_됨이다() {
        when(foodSafety.isConfigured()).thenReturn(false);
        when(off.isEnabled()).thenReturn(false);

        assertThatThrownBy(() -> service.lookup(CODE))
                .extracting("errorCode").isEqualTo(ErrorCode.FOOD_DB_NOT_CONFIGURED);
    }

    @Test
    void 바코드가_아닌_값은_거절하고_숫자만_남긴다() {
        assertThatThrownBy(() -> BarcodeLookupService.normalize("https://qr.example"))
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_INPUT);
        assertThat(BarcodeLookupService.normalize(" 8801043-014809 ")).isEqualTo(CODE);
    }
}
