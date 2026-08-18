package com.fitto.common.upload;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
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

    public UploadController(CloudinaryProperties properties, PlanGuard planGuard) {
        this.properties = properties;
        this.planGuard = planGuard;
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
}
