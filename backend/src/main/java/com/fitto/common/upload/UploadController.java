package com.fitto.common.upload;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import java.time.Instant;
import java.util.List;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 이미지 업로드 서명 발급 — Cloudinary signed upload.
 * unsigned preset 은 클라이언트에 노출되어 악용 시 스토리지가 오염될 수 있어,
 * 로그인 사용자에게만 단기 서명을 발급한다 (Cloudinary 서명은 발급 후 1시간 유효).
 *
 * <p><b>사진 한도를 여기서 센다.</b> 앱의 모든 사진 업로드(피드·앨범·맛집·식단·체중·프로필)가
 * {@code utils/imageUpload.ts} 한 곳을 지나고, 그게 이 엔드포인트를 부른다. 업로드 자체는
 * 앱이 Cloudinary 로 직접 보내므로 서버가 볼 수 있는 지점은 <b>서명 발급뿐</b>이다.
 *
 * <p>사진은 AI 와 달리 <b>진짜로 원가가 나가는</b> 항목이다 — Cloudinary 무료 티어(≈25GB)는
 * 유예가 아니라 절벽이라, 무료 체험 기간에도 상한이 필요하다.
 *
 * <p>서명 생성 자체는 {@link CloudinarySigner} 로 뺐다 — 음성 클립(VoiceClipController)도
 * 같은 계정·같은 규칙을 쓰지만 한도 정책이 다르다(문구당 1개, 재녹음은 교체).
 */
@RestController
@RequestMapping("/api/v1/uploads")
public class UploadController {

    private final CloudinaryProperties properties;
    private final R2Properties r2Properties;
    private final R2Storage r2Storage;
    private final PlanGuard planGuard;
    private final CloudinaryImageDeleter imageDeleter;

    public UploadController(CloudinaryProperties properties, R2Properties r2Properties, R2Storage r2Storage,
                            PlanGuard planGuard, CloudinaryImageDeleter imageDeleter) {
        this.properties = properties;
        this.r2Properties = r2Properties;
        this.r2Storage = r2Storage;
        this.planGuard = planGuard;
        this.imageDeleter = imageDeleter;
    }

    /**
     * @param accept      앱이 받을 수 있는 업로드 방식 — 새 앱은 {@code r2} 를 보낸다. 옛 앱은 아무것도 안 보내므로
     *                    계속 Cloudinary 서명을 받는다(옛 앱이 R2 응답을 받으면 업로드가 깨진다)
     * @param contentType R2 로 갈 때 서명에 묶을 이미지 형식(기본 image/jpeg — 앱이 JPEG 로 줄여 올린다)
     */
    @PostMapping("/signature")
    public ApiResponse<UploadSignatureResponse> signature(@AuthenticationPrincipal AuthUser user,
                                                          @RequestParam(required = false) String accept,
                                                          @RequestParam(required = false) String contentType) {
        boolean r2 = useR2(accept);
        // 설정 확인이 먼저다 — 기능이 아예 꺼져 있는데 한도를 깎으면 안 된다.
        if (!r2 && !properties.isConfigured()) {
            throw new BusinessException(ErrorCode.UPLOAD_NOT_CONFIGURED);
        }
        String type = imageType(contentType, r2);
        planGuard.consume(user.id(), Feature.PHOTO_UPLOAD);
        return ApiResponse.success(issue(r2, type));
    }

    /**
     * 식단 사진 서명 — 폴더는 공용 서명과 같고, 한도만 사람 단위 {@code MEAL_PHOTO} 에서 센다(Feature 주석).
     *
     * <p>폴더를 따로 두지 않는 이유: 식단 화면은 사진을 고르는 즉시 미리 올리고, 안 쓰면 {@link #discard} 로 치운다.
     * 그 정리는 업로드 폴더 <b>바로 아래</b>의 파일만 허용한다({@link UploadDiscardPolicy}) — 하위 폴더로 옮기면 버린 사진이
     * 쌓인다. 이 서명으로 올린 사진을 다른 화면에 써도 서버는 막지 못하지만, 그러려면 앱을 고쳐야 하고 얻는 건 사진 몇 장이다.
     */
    @PostMapping("/meal-signature")
    public ApiResponse<UploadSignatureResponse> mealSignature(@AuthenticationPrincipal AuthUser user,
                                                              @RequestParam(required = false) String accept,
                                                              @RequestParam(required = false) String contentType) {
        boolean r2 = useR2(accept);
        if (!r2 && !properties.isConfigured()) {
            throw new BusinessException(ErrorCode.UPLOAD_NOT_CONFIGURED);
        }
        String type = imageType(contentType, r2);
        planGuard.consume(user.id(), Feature.MEAL_PHOTO);
        return ApiResponse.success(issue(r2, type));
    }

    /** R2 로 보낼지 — 앱이 받을 수 있다고 했고(accept=r2) 서버 스위치(R2_UPLOADS_ENABLED)가 켜져 있을 때만 */
    private boolean useR2(String accept) {
        return accept != null && accept.contains("r2") && r2Properties.isUploadReady();
    }

    /** 형식 검사는 한도 차감 <b>전에</b> — 거절될 요청이 사진 한 장을 깎으면 안 된다 */
    private static String imageType(String contentType, boolean r2) {
        String type = contentType == null || contentType.isBlank() ? "image/jpeg" : contentType.trim().toLowerCase();
        if (r2 && !R2Storage.isSupportedImageType(type)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "올릴 수 없는 사진 형식이에요.");
        }
        return type;
    }

    /**
     * R2 도 Cloudinary 와 같은 루트 폴더({@code fitto}) 바로 아래에 둔다 — 버리기·저장 검증이 "업로드 폴더 바로 아래"를
     * 같은 규칙으로 본다({@link UploadDiscardPolicy}).
     */
    private UploadSignatureResponse issue(boolean r2, String contentType) {
        if (r2) {
            return UploadSignatureResponse.r2(
                    r2Storage.presignUpload(properties.getFolder(), contentType, Instant.now()), properties.getFolder());
        }
        return CloudinarySigner.sign(properties);
    }

    /**
     * 올렸지만 쓰지 않은 사진 치우기 — 앱이 미리 올린 사진을 저장하지 않고 버렸을 때(다시 고르기·사진 빼기·화면 나가기)와
     * 분석에만 쓰고 저장하지 않는 사진(영양성분표)을 부른다. 예전엔 이런 파일이 Cloudinary 에 그대로 쌓였다
     * (docs/lovebody-current-state.md §4-6).
     *
     * <p>지울지는 {@link UploadDiscardPolicy} 와 삭제기의 참조 확인이 정한다. 조건에 안 맞으면 조용히 아무것도 하지 않는다 —
     * 앱은 결과를 기다리지 않고(파일 정리는 화면 동작이 아니다), 이유를 알려 줄 필요도 없다.
     */
    @PostMapping("/discard")
    public ApiResponse<Void> discard(@AuthenticationPrincipal AuthUser user, @RequestBody DiscardUploadRequest request) {
        if (request != null && UploadDiscardPolicy.isDiscardable(request.url(), properties, r2Properties, Instant.now())) {
            imageDeleter.deleteAll(List.of(request.url()));
        }
        return ApiResponse.success(null);
    }

    public record DiscardUploadRequest(String url) {
    }
}
