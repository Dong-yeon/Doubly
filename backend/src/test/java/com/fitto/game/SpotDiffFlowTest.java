package com.fitto.game;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.ChatMessage;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.repository.ChatMessageRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.domain.SpotPuzzle;
import com.fitto.game.domain.SpotPuzzleStatus;
import com.fitto.game.dto.SpotDiffListResponse;
import com.fitto.game.dto.SpotHintResponse;
import com.fitto.game.dto.SpotPuzzleResponse;
import com.fitto.game.dto.SpotTapRequest;
import com.fitto.game.dto.SpotTapResponse;
import com.fitto.game.repository.SpotPuzzleJobRepository;
import com.fitto.game.repository.SpotPuzzlePlayRepository;
import com.fitto.game.repository.SpotPuzzleRepository;
import com.fitto.game.service.GameStreakService;
import com.fitto.game.service.SpotDiffScheduler;
import com.fitto.game.service.SpotDiffService;
import com.fitto.game.spotdiff.SpotDiffRules;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 틀린그림찾기 통합 플로우 — H2. docs/spot-diff-design_2026-10-14.md.
 *
 * <p>worker 가 만드는 READY 퍼즐은 JDBC 로 직접 넣는다(이미지·정답·크기). 여기서 보는 것은 서버 몫이다:
 * 판정 경계값, REPEAT 는 오답이 아님, 같은 clientTapId 재전송, 동시 탭, 다 찾은 뒤 409, 블라인드, 403, 원본 사진이
 * 사라지면 만료, 시간 만료, 사진이 모자랄 때.
 */
@SpringBootTest
@ActiveProfiles("test")
class SpotDiffFlowTest {

    /** 1600×1200 — 허용치는 짧은 변 2% = 24px, r 0.02 × 긴 변 = 32px → 경계 56px */
    static final int W = 1600;
    static final int H = 1200;
    static final double R = 0.02;
    /** 다섯 정답 — 좌표는 응답 문자열에서 찾아볼 수 있게 흔치 않은 값 */
    static final double[][] DIFFS = {
            {0.2137, 0.2113}, {0.5137, 0.2113}, {0.8137, 0.2113}, {0.2137, 0.7113}, {0.8137, 0.7113}};

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired RelationRepository relationRepository;
    @Autowired SpotDiffService service;
    @Autowired SpotDiffScheduler scheduler;
    @Autowired SpotPuzzleRepository puzzleRepository;
    @Autowired SpotPuzzlePlayRepository playRepository;
    @Autowired SpotPuzzleJobRepository jobRepository;
    @Autowired ChatMessageRepository chatMessageRepository;
    @Autowired GameStreakService streakService;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper objectMapper;

    // ── 준비 ──────────────────────────────────────────────────────────

    private Long register(String prefix) {
        String email = prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@fitto.com";
        return authService.register(
                new RegisterRequest(email, "password123", prefix, null, null, true, true, false), "127.0.0.1")
                .user().id();
    }

    /** [a, b, relationId] */
    private long[] couple(String prefixA, String prefixB) {
        Long a = register(prefixA);
        Long b = register(prefixB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        Long rid = relationRepository.findByUserAndTypeAndStatus(a, RelationType.COUPLE, RelationStatus.ACTIVE)
                .get(0).getId();
        return new long[]{a, b, rid};
    }

    private long insertPost(long coupleId, long authorId, String url) {
        jdbc.update("insert into feed_posts (couple_id, author_id, image_url, record_date, created_at) values (?,?,?,?,?)",
                coupleId, authorId, url, LocalDate.now(), Timestamp.valueOf(LocalDateTime.now()));
        return jdbc.queryForObject("select max(id) from feed_posts where couple_id = ?", Long.class, coupleId);
    }

    private static String layout() {
        StringBuilder sb = new StringBuilder("{\"width\":" + W + ",\"height\":" + H + ",\"level\":\"normal\",\"diffs\":[");
        for (int i = 0; i < DIFFS.length; i++) {
            if (i > 0) sb.append(',');
            sb.append("{\"id\":").append(i).append(",\"kind\":\"color\",\"cx\":").append(DIFFS[i][0])
                    .append(",\"cy\":").append(DIFFS[i][1]).append(",\"r\":").append(R).append('}');
        }
        return sb.append("]}").toString();
    }

    /** worker 가 끝낸 것과 같은 READY 퍼즐 — 원본은 일상 사진 */
    private long readyPuzzle(long[] c, String sourceType, long sourceId, String sourceUrl) {
        jdbc.update("""
                insert into spot_puzzles (couple_id, puzzle_date, source_type, source_id, source_url, image_a_url, image_b_url,
                  width, height, layout_json, seed, level, generator_version, status, result_posted, created_at, updated_at, expires_at)
                values (?, null, ?, ?, ?, ?, ?, ?, ?, ?, 7, 'normal', 'd1', 'READY', false, ?, ?, ?)
                """,
                c[2], sourceType, sourceId, sourceUrl,
                "https://media.dubly.co.kr/fitto/spot-diff/1700000000-aaaaaaaa.jpg",
                "https://media.dubly.co.kr/fitto/spot-diff/1700000000-bbbbbbbb.jpg",
                W, H, layout(),
                Timestamp.valueOf(LocalDateTime.now()), Timestamp.valueOf(LocalDateTime.now()),
                Timestamp.valueOf(LocalDateTime.now().plus(SpotDiffRules.LIFETIME)));
        return jdbc.queryForObject("select max(id) from spot_puzzles where couple_id = ?", Long.class, c[2]);
    }

    private long readyPuzzle(long[] c) {
        String url = "https://res.cloudinary.com/demo/image/upload/v1/fitto/" + UUID.randomUUID() + ".jpg";
        return readyPuzzle(c, "POST", insertPost(c[2], c[0], url), url);
    }

    private static SpotTapRequest tap(double x, double y) {
        return new SpotTapRequest(UUID.randomUUID().toString(), x, y);
    }

    private static SpotTapRequest tapOn(int diff) {
        return tap(DIFFS[diff][0], DIFFS[diff][1]);
    }

    private static void assertRejected(Runnable r, ErrorCode code) {
        assertThatThrownBy(r::run)
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", code);
    }

    private void findAll(long userId, long puzzleId) {
        for (int i = 0; i < DIFFS.length; i++) service.tap(userId, puzzleId, tapOn(i));
    }

    // ── 판정 ──────────────────────────────────────────────────────────

    @Test
    void 판정_경계는_r_더하기_짧은_변_2퍼센트다() {
        long[] c = couple("sa", "sb");
        long id = readyPuzzle(c);
        service.open(c[0], id);

        double edge = R * W + SpotDiffRules.TOLERANCE_RATIO * H; // 56px
        // 가로로 경계 바로 안쪽 → 맞음
        SpotTapResponse in = service.tap(c[0], id, tap(DIFFS[0][0] + (edge - 0.5) / W, DIFFS[0][1]));
        assertThat(in.result()).isEqualTo("HIT");
        assertThat(in.diffId()).isZero();
        // 세로는 높이로 잰다 — 경계 바로 안쪽
        assertThat(service.tap(c[0], id, tap(DIFFS[1][0], DIFFS[1][1] + (edge - 0.5) / H)).result()).isEqualTo("HIT");
        // 경계 바로 바깥 → 오답
        SpotTapResponse out = service.tap(c[0], id, tap(DIFFS[2][0] + (edge + 0.5) / W, DIFFS[2][1]));
        assertThat(out.result()).isEqualTo("MISS");
        assertThat(out.circle()).isNull();
        assertThat(out.puzzle().me().wrongTaps()).isEqualTo(1);
        assertThat(out.puzzle().me().found()).hasSize(2);
    }

    @Test
    void 이미_찾은_차이를_다시_누르면_오답으로_세지_않는다() {
        long[] c = couple("ra", "rb");
        long id = readyPuzzle(c);
        service.open(c[0], id);
        service.tap(c[0], id, tapOn(3));

        SpotTapResponse again = service.tap(c[0], id, tapOn(3));
        assertThat(again.result()).isEqualTo("REPEAT");
        assertThat(again.diffId()).isEqualTo(3);
        assertThat(again.puzzle().me().wrongTaps()).isZero();
        assertThat(again.puzzle().me().found()).hasSize(1);
    }

    @Test
    void 같은_clientTapId_는_저장된_결과를_그대로_돌려준다() {
        long[] c = couple("ia", "ib");
        long id = readyPuzzle(c);
        service.open(c[0], id);

        SpotTapRequest miss = tap(0.5, 0.5);
        service.tap(c[0], id, miss);
        SpotTapResponse resent = service.tap(c[0], id, miss);
        assertThat(resent.result()).isEqualTo("MISS");
        assertThat(resent.puzzle().me().wrongTaps()).isEqualTo(1);   // 두 번 세지 않는다

        SpotTapRequest hit = tapOn(1);
        service.tap(c[0], id, hit);
        SpotTapResponse hitAgain = service.tap(c[0], id, hit);
        assertThat(hitAgain.result()).isEqualTo("HIT");                // REPEAT 가 아니라 처음 판정 그대로
        assertThat(hitAgain.puzzle().me().found()).hasSize(1);

        // 남의 탭 번호를 쓰면 남의 판정을 돌려주지 않는다
        service.open(c[1], id);
        assertRejected(() -> service.tap(c[1], id, hit), ErrorCode.INVALID_INPUT);
    }

    @Test
    void 두_탭이_동시에_같은_차이를_눌러도_한_번만_인정된다() throws Exception {
        long[] c = couple("ca", "cb");
        long id = readyPuzzle(c);
        service.open(c[0], id);

        int n = 6;
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<String>> results = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Callable<String> call = () -> {
                go.await();
                return service.tap(c[0], id, tapOn(2)).result();
            };
            results.add(pool.submit(call));
        }
        go.countDown();
        List<String> got = new ArrayList<>();
        for (Future<String> f : results) got.add(f.get());
        pool.shutdown();

        assertThat(got).filteredOn("HIT"::equals).hasSize(1);
        assertThat(got).filteredOn("REPEAT"::equals).hasSize(n - 1);
        var play = playRepository.findByPuzzleIdAndUserId(id, c[0]).orElseThrow();
        assertThat(play.found()).containsExactly(2);
        assertThat(play.getWrongTaps()).isZero();
    }

    @Test
    void 다_찾은_뒤의_새_탭은_409_마지막_탭의_재전송은_원래_결과() {
        long[] c = couple("fa", "fb");
        long id = readyPuzzle(c);
        service.open(c[0], id);
        for (int i = 0; i < 4; i++) service.tap(c[0], id, tapOn(i));
        SpotTapRequest last = tapOn(4);
        SpotTapResponse done = service.tap(c[0], id, last);
        assertThat(done.puzzle().me().finished()).isTrue();
        assertThat(done.puzzle().me().elapsedMs()).isGreaterThanOrEqualTo(0);

        assertRejected(() -> service.tap(c[0], id, tap(0.5, 0.5)), ErrorCode.SPOT_DIFF_FINISHED);
        assertThat(ErrorCode.SPOT_DIFF_FINISHED.getStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(service.tap(c[0], id, last).result()).isEqualTo("HIT");
        assertRejected(() -> service.hint(c[0], id), ErrorCode.SPOT_DIFF_FINISHED);
    }

    @Test
    void 열지_않고_탭하면_409_범위_밖은_400() {
        long[] c = couple("oa", "ob");
        long id = readyPuzzle(c);
        assertRejected(() -> service.tap(c[0], id, tapOn(0)), ErrorCode.SPOT_DIFF_NOT_STARTED);
        service.open(c[0], id);
        assertRejected(() -> service.tap(c[0], id, tap(1.2, 0.5)), ErrorCode.SPOT_DIFF_TAP_RANGE);
        assertRejected(() -> service.tap(c[0], id, tap(0.5, -0.01)), ErrorCode.SPOT_DIFF_TAP_RANGE);
    }

    // ── 블라인드·결과 ─────────────────────────────────────────────────

    @Test
    void 상대가_안_끝났으면_정답도_상대_기록도_내_응답에_없다() throws Exception {
        long[] c = couple("ba", "bb");
        long id = readyPuzzle(c);
        service.open(c[0], id);
        service.tap(c[0], id, tapOn(0));
        service.tap(c[0], id, tapOn(1));
        service.tap(c[0], id, tap(0.5, 0.5));

        // 상대(b) — 아직 열지도 않았다
        SpotPuzzleResponse forB = service.get(c[1], id);
        assertThat(forB.partnerFound()).isEqualTo(2);
        assertThat(forB.result()).isNull();
        assertThat(forB.me().started()).isFalse();
        assertThat(forB.me().found()).isEmpty();
        String json = objectMapper.writeValueAsString(forB);
        for (double[] d : DIFFS) {
            assertThat(json).doesNotContain(String.valueOf(d[0]));    // 어떤 정답 좌표도 없다
        }
        assertThat(json).doesNotContain("layout").doesNotContain("wrongTaps\":1");

        // 나(a) — 내가 찾은 둘만, 못 찾은 셋의 좌표는 없다
        String mine = objectMapper.writeValueAsString(service.get(c[0], id));
        assertThat(mine).contains("0.2137", "0.5137").doesNotContain("0.8137");

        // 둘 다 열어서 b 가 다 찾고, a 가 마저 찾으면 결과가 열린다
        service.open(c[1], id);
        findAll(c[1], id);
        assertThat(service.get(c[0], id).result()).isNull();      // a 는 아직
        service.tap(c[0], id, tapOn(2));
        service.tap(c[0], id, tapOn(3));
        SpotTapResponse last = service.tap(c[0], id, tapOn(4));

        SpotPuzzleResponse.Result result = last.puzzle().result();
        assertThat(result).isNotNull();
        assertThat(result.answers()).hasSize(5);
        assertThat(result.me().wrongTaps()).isEqualTo(1);
        assertThat(result.partner().finished()).isTrue();
        assertThat(result.partner().elapsedMs()).isNotNull();
        assertThat(puzzleRepository.findById(id).orElseThrow().getCompletedAt()).isNotNull();

        // 승부 없는 결과 카드 한 장 + 스트릭
        List<ChatMessage> cards = chatMessageRepository.findAll().stream()
                .filter(m -> m.getRelationId().equals(c[2]) && m.getMessageType() == MessageType.GAME_CARD)
                .toList();
        assertThat(cards).hasSize(1);
        assertThat(cards.get(0).getContent()).contains(SpotDiffRules.DISPLAY_NAME, "둘 다 찾았어요")
                .doesNotContain("승");
        assertThat(streakService.streak(c[0]).playedToday()).isTrue();
    }

    @Test
    void 힌트는_정답을_품는_3배_원이고_상대에게_보이지_않는다() {
        long[] c = couple("ha", "hb");
        long id = readyPuzzle(c);
        service.open(c[0], id);
        service.tap(c[0], id, tapOn(0));

        SpotHintResponse h1 = service.hint(c[0], id);
        assertThat(h1.fresh()).isTrue();
        assertThat(h1.circle().r()).isEqualTo(R * SpotDiffRules.HINT_RADIUS_FACTOR);
        // 힌트는 못 찾은 첫 차이(1번)를 품는다 — 정답 원 전체가 힌트 원 안에
        double dx = (h1.circle().cx() - DIFFS[1][0]) * W;
        double dy = (h1.circle().cy() - DIFFS[1][1]) * H;
        assertThat(Math.hypot(dx, dy) + R * W).isLessThanOrEqualTo(h1.circle().r() * W);
        // 중심을 그대로 알려 주지는 않는다
        assertThat(Math.hypot(dx, dy)).isGreaterThan(1.0);

        SpotHintResponse h2 = service.hint(c[0], id);
        assertThat(h2.puzzle().me().hintsUsed()).isEqualTo(2);
        assertThat(h2.puzzle().me().hints()).hasSize(2);

        SpotPuzzleResponse forB = service.get(c[1], id);
        assertThat(forB.me().hints()).isEmpty();
        assertThat(forB.result()).isNull();
    }

    // ── 권한 ──────────────────────────────────────────────────────────

    @Test
    void 커플이_아닌_사용자는_403() {
        long[] c = couple("pa", "pb");
        long id = readyPuzzle(c);
        Long stranger = register("px");

        assertRejected(() -> service.get(stranger, id), ErrorCode.GAME_NOT_MEMBER);
        assertRejected(() -> service.open(stranger, id), ErrorCode.GAME_NOT_MEMBER);
        assertRejected(() -> service.tap(stranger, id, tapOn(0)), ErrorCode.GAME_NOT_MEMBER);
        assertRejected(() -> service.hint(stranger, id), ErrorCode.GAME_NOT_MEMBER);
        assertThat(ErrorCode.GAME_NOT_MEMBER.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
        assertRejected(() -> service.get(stranger, 999_999_999L), ErrorCode.GAME_NOT_FOUND);
    }

    // ── 만료 ──────────────────────────────────────────────────────────

    @Test
    void 공유를_거둔_사진의_퍼즐은_만료되고_이미지를_지운다() {
        long[] c = couple("wa", "wb");
        String url = "https://res.cloudinary.com/demo/image/upload/v1/fitto/" + UUID.randomUUID() + ".jpg";
        jdbc.update("insert into workouts (user_id, workout_date, image_url, image_shared, created_at) values (?,?,?,?,?)",
                c[0], LocalDate.now(), url, true, Timestamp.valueOf(LocalDateTime.now()));
        long workoutId = jdbc.queryForObject("select max(id) from workouts where user_id = ?", Long.class, c[0]);
        long id = readyPuzzle(c, "WORKOUT", workoutId, url);
        service.open(c[0], id);

        scheduler.sweep();
        assertThat(puzzleRepository.findById(id).orElseThrow().isReady()).isTrue();   // 아직 공유 중

        // "PRIVATE 로 바꿈" — 이 앱에서 사진을 비공개로 돌리는 값은 운동 image_shared 하나뿐이다
        jdbc.update("update workouts set image_shared = false where id = ?", workoutId);
        scheduler.sweep();

        SpotPuzzle closed = puzzleRepository.findById(id).orElseThrow();
        assertThat(closed.getStatus()).isEqualTo(SpotPuzzleStatus.EXPIRED);
        assertThat(closed.getExpireReason()).isEqualTo(SpotPuzzle.EXPIRE_PHOTO_REMOVED);
        assertThat(closed.getImageAUrl()).isNull();
        assertThat(closed.getImageBUrl()).isNull();
        assertRejected(() -> service.tap(c[0], id, tapOn(0)), ErrorCode.SPOT_DIFF_CLOSED);
        SpotPuzzleResponse r = service.get(c[0], id);
        assertThat(r.closed()).isTrue();
        assertThat(r.imageAUrl()).isNull();
    }

    @Test
    void 원본을_지우면_정리_작업을_기다리지_않고_탭에서_닫힌다() {
        long[] c = couple("da", "db");
        long id = readyPuzzle(c);
        service.open(c[0], id);
        SpotPuzzle p = puzzleRepository.findById(id).orElseThrow();
        jdbc.update("delete from feed_posts where id = ?", p.getSourceId());

        assertRejected(() -> service.tap(c[0], id, tapOn(0)), ErrorCode.SPOT_DIFF_CLOSED);
        // 409 를 냈어도 닫은 상태는 커밋됐다
        assertThat(puzzleRepository.findById(id).orElseThrow().getExpireReason())
                .isEqualTo(SpotPuzzle.EXPIRE_PHOTO_REMOVED);
    }

    @Test
    void 시간이_지나면_닫히고_결과가_열리며_마감_카드가_한_장_나간다() {
        long[] c = couple("ta", "tb");
        long id = readyPuzzle(c);
        service.open(c[0], id);
        service.tap(c[0], id, tapOn(0));
        jdbc.update("update spot_puzzles set expires_at = ? where id = ?",
                Timestamp.valueOf(LocalDateTime.now().minusMinutes(1)), id);

        scheduler.sweep();
        scheduler.sweep();

        SpotPuzzle closed = puzzleRepository.findById(id).orElseThrow();
        assertThat(closed.getExpireReason()).isEqualTo(SpotPuzzle.EXPIRE_TIME);
        assertThat(closed.getImageAUrl()).isNotNull();   // 시간 만료는 결과를 보여 줘야 하므로 이미지를 남긴다
        SpotPuzzleResponse forB = service.get(c[1], id);
        assertThat(forB.result()).isNotNull();
        assertThat(forB.result().partner().found()).isEqualTo(1);
        assertThat(forB.result().me().started()).isFalse();
        long cards = chatMessageRepository.findAll().stream()
                .filter(m -> m.getRelationId().equals(c[2]) && m.getMessageType() == MessageType.GAME_CARD)
                .count();
        assertThat(cards).isEqualTo(1);
        assertRejected(() -> service.tap(c[0], id, tapOn(1)), ErrorCode.SPOT_DIFF_CLOSED);
    }

    // ── 생성 대기열 ───────────────────────────────────────────────────

    @Test
    void 공유_사진이_5장_미만이면_만들지_않고_NOT_ENOUGH_PHOTOS() {
        long[] c = couple("na", "nb");
        for (int i = 0; i < 4; i++) insertPost(c[2], c[0], "https://res.cloudinary.com/demo/image/upload/v1/fitto/n" + i + UUID.randomUUID() + ".jpg");

        SpotDiffListResponse list = service.list(c[0]);
        assertThat(list.puzzles()).hasSize(1);
        assertThat(list.puzzles().get(0).status()).isEqualTo("NOT_ENOUGH_PHOTOS");
        assertThat(list.puzzles().get(0).imageAUrl()).isNull();
        assertThat(jobRepository.findByPuzzleId(list.puzzles().get(0).id())).isEmpty();
        // 다시 열어도 같은 날 판은 하나
        assertThat(service.list(c[1]).puzzles()).hasSize(1);
    }

    @Test
    void 공유_사진이_5장이면_작업을_넣고_최근_30일에_쓴_사진은_후보에서_뺀다() throws Exception {
        long[] c = couple("ja", "jb");
        List<String> urls = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            String u = "https://res.cloudinary.com/demo/image/upload/v1/fitto/j" + i + UUID.randomUUID() + ".jpg";
            urls.add(u);
            insertPost(c[2], c[0], u);
        }
        // 어제 퍼즐로 쓴 사진 하나
        readyPuzzle(c, "POST", 0L, urls.get(0));

        SpotDiffListResponse list = service.list(c[0]);
        SpotPuzzleResponse today = list.puzzles().stream().filter(p -> p.status().equals("PENDING")).findFirst().orElseThrow();
        assertThat(today.imageAUrl()).isNull();
        var jobs = jobRepository.findByPuzzleId(today.id());
        assertThat(jobs).hasSize(1);
        var candidates = objectMapper.readTree(jobs.get(0).getCandidates());
        assertThat(candidates).hasSize(5);
        assertThat(jobs.get(0).getCandidates()).doesNotContain(urls.get(0));
        assertThat(candidates.get(0).path("type").asText()).isEqualTo("POST");

        // PENDING 판은 열 수 없다
        assertRejected(() -> service.open(c[0], today.id()), ErrorCode.SPOT_DIFF_NOT_READY);
    }

    @Test
    void 관계를_지우면_퍼즐과_풀이가_함께_지워진다() {
        long[] c = couple("xa", "xb");
        long id = readyPuzzle(c);
        service.open(c[0], id);
        service.tap(c[0], id, tapOn(0));

        relationService.endRelation(c[0], c[2]);
        relationService.purgeRecords(c[0], c[2]);

        assertThat(puzzleRepository.findById(id)).isEmpty();
        assertThat(playRepository.findByPuzzleId(id)).isEmpty();
    }
}
