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
    private final PlanGuard planGuard;
    private final CloudinaryImageDeleter imageDeleter;

    public UploadController(CloudinaryProperties properties, PlanGuard planGuard, CloudinaryImageDeleter imageDeleter) {
        this.properties = properties;
        this.planGuard = planGuard;
        this.imageDeleter = imageDeleter;
    }

    @PostMapping("/signature")
    public ApiResponse<UploadSignatureResponse> signature(@AuthenticationPrincipal AuthUser user) {
        // 설정 확인이 먼저다 — 기능이 아예 꺼져 있는데 한도를 깎으면 안 된다.
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.UPLOAD_NOT_CONFIGURED);
        }
        planGuard.consume(user.id(), Feature.PHOTO_UPLOAD);
        return ApiResponse.success(CloudinarySigner.sign(properties));
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
        if (request != null && UploadDiscardPolicy.isDiscardable(request.url(), properties, Instant.now())) {
            imageDeleter.deleteAll(List.of(request.url()));
        }
        return ApiResponse.success(null);
    }

    public record DiscardUploadRequest(String url) {
    }
}
