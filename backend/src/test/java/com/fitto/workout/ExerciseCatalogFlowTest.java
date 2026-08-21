package com.fitto.workout;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.workout.domain.ExerciseCatalog;
import com.fitto.workout.dto.ExerciseCatalogResponse;
import com.fitto.workout.repository.ExerciseCatalogRepository;
import com.fitto.workout.service.ExerciseCatalogService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 종목 카탈로그 조회 — H2 기반.
 *
 * <p>커스텀 종목(created_by)을 만드는 API 는 아직 없지만, 필터 자체는 목록 조회의
 * 책임이므로 리포지토리에 직접 시드해 검증한다. 이 필터가 없으면 커스텀 종목 기능이
 * 열리는 순간 타인이 만든 종목이 전 유저에게 노출된다(진단 리포트 확정 버그).
 */
@SpringBootTest
@ActiveProfiles("test")
class ExerciseCatalogFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    ExerciseCatalogService catalogService;
    @Autowired
    ExerciseCatalogRepository catalogRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), "127.0.0.1").user().id();
    }

    @Test
    void 시스템_종목과_내_커스텀_종목만_보이고_남의_커스텀_종목은_안_보인다() {
        Long me = register("catalog1@fitto.com");
        Long partner = register("catalog2@fitto.com");

        catalogRepository.save(ExerciseCatalog.builder()
                .name("테스트시스템종목").category("근력").muscleGroup("가슴").build()); // createdBy null
        catalogRepository.save(ExerciseCatalog.builder()
                .name("내커스텀종목").category("근력").muscleGroup("등").createdBy(me).build());
        catalogRepository.save(ExerciseCatalog.builder()
                .name("남의커스텀종목").category("근력").muscleGroup("하체").createdBy(partner).build());

        List<String> names = catalogService.list(me, null, null).stream()
                .map(ExerciseCatalogResponse::name)
                .toList();

        assertThat(names).contains("테스트시스템종목", "내커스텀종목");
        assertThat(names).doesNotContain("남의커스텀종목");
    }

    @Test
    void muscleGroup_필터에도_created_by_필터가_함께_적용된다() {
        Long me = register("catalog3@fitto.com");
        Long partner = register("catalog4@fitto.com");

        catalogRepository.save(ExerciseCatalog.builder()
                .name("내등커스텀").category("근력").muscleGroup("등").createdBy(me).build());
        catalogRepository.save(ExerciseCatalog.builder()
                .name("남의등커스텀").category("근력").muscleGroup("등").createdBy(partner).build());

        List<String> names = catalogService.list(me, "등", null).stream()
                .map(ExerciseCatalogResponse::name)
                .toList();

        assertThat(names).contains("내등커스텀");
        assertThat(names).doesNotContain("남의등커스텀");
    }

    @Test
    void names_필터에도_created_by_필터가_함께_적용된다() {
        Long me = register("catalog5@fitto.com");
        Long partner = register("catalog6@fitto.com");

        catalogRepository.save(ExerciseCatalog.builder()
                .name("내이름조회종목").category("근력").muscleGroup("코어").createdBy(me).build());
        catalogRepository.save(ExerciseCatalog.builder()
                .name("남의이름조회종목").category("근력").muscleGroup("코어").createdBy(partner).build());

        List<String> names = catalogService.list(
                        me, null, List.of("내이름조회종목", "남의이름조회종목")).stream()
                .map(ExerciseCatalogResponse::name)
                .toList();

        assertThat(names).containsExactly("내이름조회종목");
    }
}
