package com.fitto.place.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.common.upload.CloudinaryImageFetcher;
import com.fitto.common.upload.CloudinaryProperties;
import com.fitto.common.upload.CloudinaryUrls;
import com.fitto.place.domain.Place;
import com.fitto.place.domain.PlaceMenuItem;
import com.fitto.place.domain.PlaceMenuPhoto;
import com.fitto.place.dto.MenuBoardAnalysisResponse;
import com.fitto.place.dto.PlaceMenuResponse;
import com.fitto.place.dto.SaveMenuBoardRequest;
import com.fitto.place.repository.PlaceMenuItemRepository;
import com.fitto.place.repository.PlaceMenuPhotoRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * "우리가 쌓는 메뉴"(V131) — 메뉴판을 찍으면 AI 가 이름·가격을 읽고, 사람이 확인해 장소 메뉴로 저장한다.
 * 설계: docs/LOVELICHELIN_PLACE_MENU_2026-10-06.md.
 *
 * <p><b>왜 식단 사진 분석을 그대로 쓰지 않나</b>: {@code FoodAnalysisService} 도 메뉴판(TEXT_IN_PHOTO)을 읽지만
 * "내가 먹은 것"의 칼로리를 추정하는 프롬프트라 가격을 버리고 1인분을 가정한다. 여기서 필요한 건 메뉴판 <b>전체</b>의
 * 이름·가격이라 프롬프트·스키마가 다르다. 한도는 같은 {@link Feature#AI_FOOD_PHOTO}(음식 사진 분석)를 쓴다 — 사진 한 장을
 * 읽는 같은 비용이고, 새 기능 키를 만들면 앱의 플랜 표(PlanFeatureSyncTest)까지 늘어난다.
 *
 * <p>분석은 저장하지 않는다. 메뉴판 글씨는 잘못 읽히기 쉬워서 사람이 확인한 목록만 남긴다.
 */
@Service
public class MenuBoardService {

    /** 한 장소에 남기는 메뉴 수 — 요청 검증(SaveMenuBoardRequest @Size)과 같은 값 */
    static final int MAX_ITEMS = 80;
    /** 한 장소의 메뉴판 사진 수 — 메뉴판은 몇 장이면 충분하다. 찍을 때마다 쌓이면 사진첩이 된다 */
    static final int MAX_PHOTOS = 10;
    private static final int MAX_NAME = 100;
    private static final int MAX_PRICE = 10_000_000;

    private static final String PROMPT = """
            이 사진은 식당·카페·술집의 메뉴판(벽 메뉴, 메뉴 책, 칠판, 키오스크 화면 포함)일 수 있습니다.
            적힌 메뉴를 그대로 옮겨 주세요.
            - 메뉴판이 아니면(음식만 찍힌 사진, 영수증, 그 밖의 사진) isMenu 를 false, items 는 빈 배열로 응답합니다.
            - name: 메뉴판에 적힌 메뉴 이름 그대로. 한국어 메뉴는 한국어로 적습니다. 설명·재료·홍보 문구는 빼고 이름만 적습니다.
              크기·옵션마다 가격이 따로 적혀 있으면 "아메리카노 (L)" 처럼 이름 뒤에 붙여 각각 한 줄로 적습니다.
            - price: 원 단위 정수. "9,000"·"9000원"·"9천" 은 9000 입니다. 천 원 단위로 "9.0"·"9.5" 처럼 적힌 메뉴판이면
              9000·9500 으로 바꿉니다. 가격이 없거나 "시가"면 price 를 생략합니다.
            - 메뉴판에 적힌 순서대로 적습니다. 읽을 수 없는 글자는 건너뛰고, 적혀 있지 않은 메뉴를 지어내지 않습니다.
            """;

    static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.of(
                    "isMenu", Map.of("type", "BOOLEAN"),
                    "items", Map.of(
                            "type", "ARRAY",
                            "items", Map.of(
                                    "type", "OBJECT",
                                    "properties", Map.of(
                                            "name", Map.of("type", "STRING"),
                                            "price", Map.of("type", "INTEGER")),
                                    "required", List.of("name")))),
            "required", List.of("isMenu", "items"));

    private final PlaceService placeService;
    private final PlaceMenuItemRepository itemRepository;
    private final PlaceMenuPhotoRepository photoRepository;
    private final GeminiClient geminiClient;
    private final CloudinaryProperties cloudinaryProperties;
    private final CloudinaryImageDeleter imageDeleter;
    private final CoupleEventPublisher coupleEventPublisher;
    private final CloudinaryImageFetcher imageFetcher = new CloudinaryImageFetcher();

    public MenuBoardService(PlaceService placeService,
                            PlaceMenuItemRepository itemRepository,
                            PlaceMenuPhotoRepository photoRepository,
                            GeminiClient geminiClient,
                            CloudinaryProperties cloudinaryProperties,
                            CloudinaryImageDeleter imageDeleter,
                            CoupleEventPublisher coupleEventPublisher) {
        this.placeService = placeService;
        this.itemRepository = itemRepository;
        this.photoRepository = photoRepository;
        this.geminiClient = geminiClient;
        this.cloudinaryProperties = cloudinaryProperties;
        this.imageDeleter = imageDeleter;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    /** 분석 작업을 받기 전에 요청 스레드에서 본다 — 남의 장소면 작업을 만들지도, 한도를 깎지도 않는다 */
    public void requireAccess(Long userId, Long placeId) {
        placeService.couplePlace(userId, placeId);
    }

    /**
     * 메뉴판 사진 읽기 — AI 작업 큐 안에서 돈다({@code AiJobService}). 식단 사진 분석과 같은 순서:
     * 한도 확인·차감 → 사진 받기(실패하면 환불) → Gemini(실패하면 GeminiClient 가 환불).
     */
    public MenuBoardAnalysisResponse analyze(Long userId, String photoUrl) {
        geminiClient.requireConfiguredAndCountUsage(userId, Feature.AI_FOOD_PHOTO);
        CloudinaryImageFetcher.Image image;
        try {
            image = imageFetcher.fetch(photoUrl);
        } catch (RuntimeException e) {
            geminiClient.refund(userId, Feature.AI_FOOD_PHOTO);
            throw e;
        }
        JsonNode result = geminiClient.generateJsonInBackground(userId, Feature.AI_FOOD_PHOTO,
                List.of(GeminiClient.imagePart(image.mimeType(), image.bytes()), GeminiClient.textPart(PROMPT)),
                RESPONSE_SCHEMA);
        return toAnalysis(result);
    }

    /**
     * 모델 응답 → 화면에 펼칠 목록. 빈 이름은 버리고, 같은 이름은 처음 것만, 가격은 0 이하·터무니없이 큰 값이면 비운다
     * (모르는 값을 0원으로 두면 "무료"로 읽힌다). 메뉴판이라면서 한 줄도 못 읽었으면 메뉴판이 아닌 것과 같게 돌려준다.
     */
    static MenuBoardAnalysisResponse toAnalysis(JsonNode result) {
        if (!result.path("isMenu").asBoolean(false)) {
            return MenuBoardAnalysisResponse.notMenu();
        }
        List<MenuBoardAnalysisResponse.Item> items = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (JsonNode node : result.path("items")) {
            String name = clean(node.path("name").asText(""));
            if (name.isEmpty() || !seen.add(key(name))) continue;
            JsonNode priceNode = node.path("price");
            Integer price = priceNode.isNumber() ? Integer.valueOf(priceNode.asInt()) : null;
            if (price != null && (price <= 0 || price > MAX_PRICE)) price = null;
            items.add(new MenuBoardAnalysisResponse.Item(name, price));
            if (items.size() >= MAX_ITEMS) break;
        }
        return items.isEmpty() ? MenuBoardAnalysisResponse.notMenu() : new MenuBoardAnalysisResponse(true, items);
    }

    /** 장소 상세 메뉴 — "여기서 먹은 것"(PlaceService) + 메뉴판 */
    @Transactional(readOnly = true)
    public PlaceMenuResponse menu(Long userId, Long placeId) {
        return placeService.menu(userId, placeId).withBoard(boardItems(placeId), boardPhotos(placeId));
    }

    /**
     * 메뉴 저장 — 목록을 통째로 바꾸고, 이번에 찍은 메뉴판 사진이 있으면 붙인다. 이름이 겹치면 처음 것만 남긴다.
     * 상대 화면이 열려 있으면 다시 받게 PLACE 이벤트를 보낸다(방문 기록과 같은 이벤트 — 받는 쪽이 하는 일이 같다).
     */
    @Transactional
    public PlaceMenuResponse save(Long userId, Long placeId, SaveMenuBoardRequest request) {
        Place place = placeService.couplePlace(userId, placeId);
        String photoUrl = request.photoUrl() == null || request.photoUrl().isBlank() ? null : request.photoUrl().trim();
        if (photoUrl != null && !photoRepository.existsByPlaceIdAndImageUrl(placeId, photoUrl)) {
            if (cloudinaryProperties.isConfigured()
                    && !CloudinaryUrls.isImageDirectlyIn(photoUrl, cloudinaryProperties, cloudinaryProperties.getFolder())) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "앱에서 올린 사진만 남길 수 있어요.");
            }
            if (photoRepository.countByPlaceId(placeId) >= MAX_PHOTOS) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "메뉴판 사진은 " + MAX_PHOTOS + "장까지 남길 수 있어요. 오래된 사진을 지우고 다시 해 주세요.");
            }
            photoRepository.save(PlaceMenuPhoto.builder().placeId(placeId).imageUrl(photoUrl).uploadedBy(userId).build());
        }

        itemRepository.deleteAllByPlaceId(placeId);
        Set<String> seen = new HashSet<>();
        int order = 0;
        List<PlaceMenuItem> rows = new ArrayList<>();
        for (SaveMenuBoardRequest.Item item : request.items()) {
            String name = clean(item.name());
            if (name.isEmpty() || !seen.add(key(name))) continue;
            rows.add(PlaceMenuItem.builder()
                    .placeId(placeId).name(name).price(item.price()).sortOrder(order++).updatedBy(userId).build());
        }
        itemRepository.saveAll(rows);
        coupleEventPublisher.publish(place.getCoupleId(), CoupleEvent.PLACE);
        return menu(userId, placeId);
    }

    /**
     * 메뉴판 사진 지우기 — 둘 중 누구나(메뉴는 둘이 함께 고치는 목록이다). 파일은 커밋 뒤에 지운다 — 외부 호출 실패가
     * DB 삭제를 되돌리지 않게. 다른 행이 같은 URL 을 쓰고 있으면 삭제기가 남겨 둔다(StoredMediaReferences).
     */
    @Transactional
    public PlaceMenuResponse deletePhoto(Long userId, Long placeId, Long photoId) {
        Place place = placeService.couplePlace(userId, placeId);
        PlaceMenuPhoto photo = photoRepository.findById(photoId)
                .filter(p -> placeId.equals(p.getPlaceId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "메뉴판 사진을 찾을 수 없어요."));
        photoRepository.delete(photo);
        photoRepository.flush();
        imageDeleter.deleteAllAfterCommit(List.of(photo.getImageUrl()));
        coupleEventPublisher.publish(place.getCoupleId(), CoupleEvent.PLACE);
        return menu(userId, placeId);
    }

    private List<PlaceMenuResponse.BoardItem> boardItems(Long placeId) {
        return itemRepository.findByPlaceIdOrderBySortOrderAscIdAsc(placeId).stream()
                .map(i -> new PlaceMenuResponse.BoardItem(i.getId(), i.getName(), i.getPrice()))
                .toList();
    }

    private List<PlaceMenuResponse.BoardPhoto> boardPhotos(Long placeId) {
        return photoRepository.findByPlaceIdOrderByIdDesc(placeId).stream()
                .map(p -> new PlaceMenuResponse.BoardPhoto(p.getId(), p.getImageUrl(), p.getUploadedBy(), p.getCreatedAt()))
                .toList();
    }

    /** 앞뒤 공백·여러 칸 공백을 정리하고 길이를 자른다 */
    static String clean(String name) {
        if (name == null) return "";
        String s = name.strip().replaceAll("\\s+", " ");
        return s.length() > MAX_NAME ? s.substring(0, MAX_NAME).strip() : s;
    }

    /** 같은 메뉴인지 — 공백·대소문자를 무시한다("아메리카노(L)" == "아메리카노 (L)") */
    static String key(String name) {
        return name.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }
}
