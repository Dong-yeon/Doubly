package com.fitto.content.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.TmdbProperties;
import com.fitto.content.domain.ContentType;
import com.fitto.content.service.TmdbClient.TmdbResult;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TMDB results[] 매핑 — HTTP 없는 순수 단위 테스트 (KakaoLocalClientMappingTest 와 같은 패턴).
 */
class TmdbClientMappingTest {

    private final TmdbClient client = new TmdbClient(new TmdbProperties());
    private final ObjectMapper objectMapper = new ObjectMapper();

    private JsonNode item(String json) throws Exception {
        return objectMapper.readTree(json);
    }

    @Test
    void 영화_결과를_매핑한다() throws Exception {
        JsonNode result = item("""
                {
                  "media_type": "movie",
                  "title": "아바타",
                  "release_date": "2009-12-17",
                  "poster_path": "/xyz.jpg"
                }
                """);

        TmdbResult mapped = client.mapResult(result);

        assertThat(mapped.title()).isEqualTo("아바타");
        assertThat(mapped.type()).isEqualTo(ContentType.MOVIE);
        assertThat(mapped.year()).isEqualTo("2009");
        assertThat(mapped.posterUrl()).isEqualTo("https://image.tmdb.org/t/p/w342/xyz.jpg");
    }

    @Test
    void TV_결과는_드라마로_매핑되고_name_필드를_쓴다() throws Exception {
        JsonNode result = item("""
                {
                  "media_type": "tv",
                  "name": "오징어 게임",
                  "first_air_date": "2021-09-17",
                  "poster_path": null
                }
                """);

        TmdbResult mapped = client.mapResult(result);

        assertThat(mapped.title()).isEqualTo("오징어 게임");
        assertThat(mapped.type()).isEqualTo(ContentType.DRAMA);
        assertThat(mapped.year()).isEqualTo("2021");
        assertThat(mapped.posterUrl()).isNull();
    }

    @Test
    void person_등_콘텐츠가_아닌_결과는_걸러진다() throws Exception {
        assertThat(client.mapResult(item("""
                {"media_type": "person", "name": "누군가"}
                """))).isNull();
    }

    @Test
    void 제목이_없으면_걸러진다() throws Exception {
        assertThat(client.mapResult(item("""
                {"media_type": "movie", "title": "", "release_date": "2020-01-01"}
                """))).isNull();
    }
}
