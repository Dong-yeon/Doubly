package com.fitto.content.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.TmdbProperties;
import com.fitto.content.service.TmdbClient.NowPlaying;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** TMDB now_playing 매핑 — HTTP 없이(AI 데이트 코스 영화·공연) */
class TmdbNowPlayingMappingTest {

    private final TmdbClient client = new TmdbClient(new TmdbProperties());

    @Test
    void 한국어_제목과_원제를_함께_담고_둘_다_비면_버린다() throws Exception {
        var root = new ObjectMapper().readTree("""
                {"page":1,"total_pages":3,"results":[
                  {"id":1,"title":"듄: 파트2","original_title":"Dune: Part Two"},
                  {"id":2,"title":"","original_title":""},
                  {"id":3,"title":"베테랑2","original_title":"베테랑2"}
                ]}""");

        List<NowPlaying> movies = client.mapNowPlaying(root);

        assertThat(movies).containsExactly(new NowPlaying("듄: 파트2", "Dune: Part Two"), new NowPlaying("베테랑2", "베테랑2"));
    }

    @Test
    void 설정이_없으면_빈_목록() {
        assertThat(client.nowPlaying()).isEmpty();
    }
}
