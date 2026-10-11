package com.fitto.game.catchmind;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * 캐치마인드 제시어 — 카테고리별 목록.
 *
 * <p>{@code QuestionCatalog} 와 같은 이유로 서비스에서 빼냈다. 이 게임의 수명은 사실상
 * 여기 개수에 달려 있는데, 로직 파일 안에 두면 콘텐츠를 늘릴 때마다 리뷰가 어려워진다.
 *
 * <p><b>후보는 서로 다른 카테고리에서 하나씩 뽑는다.</b> 같은 카테고리에서 셋을 뽑으면
 * "동물 셋 중 하나"가 되어 고르는 재미가 없고, 그리기 난이도도 한쪽으로 쏠린다.
 *
 * <p>제시어를 고르는 기준:
 * <ul>
 *   <li><b>그릴 수 있을 것.</b> 추상어(행복·자유)는 그리는 사람만 괴롭다.</li>
 *   <li>맞혔을 때 "아 그거!"가 될 것 — 너무 세부적이면(코카스파니엘) 맞혀도 허무하다.</li>
 *   <li>둘 중 누가 그려도 부담이 없을 것. 그림 실력이 갈리면 그 자체가 마찰이다.</li>
 * </ul>
 *
 * <p>직접 입력도 허용하므로(둘만 아는 단어), 이 목록은 <b>막힐 때의 기본값</b>에 가깝다.
 */
public final class CatchMindWords {

    private static final Map<String, List<String>> BY_CATEGORY = new LinkedHashMap<>();

    static {
        BY_CATEGORY.put("동물", List.of(
                "고양이", "강아지", "코끼리", "기린", "펭귄", "토끼", "거북이", "다람쥐",
                "고래", "돌고래", "사자", "호랑이", "판다", "부엉이", "오리", "병아리",
                "개구리", "나비", "달팽이", "문어", "상어", "햄스터", "앵무새", "고슴도치"));

        BY_CATEGORY.put("음식", List.of(
                "떡볶이", "김밥", "치킨", "피자", "라면", "삼겹살", "빙수", "붕어빵",
                "아이스크림", "케이크", "커피", "수박", "딸기", "바나나", "계란프라이",
                "짜장면", "초밥", "팝콘", "핫도그", "도넛", "마카롱", "군고구마", "탕후루"));

        BY_CATEGORY.put("사물", List.of(
                "우산", "안경", "자전거", "가위", "시계", "전화기", "냉장고", "칫솔",
                "선풍기", "기타", "카메라", "여권", "이어폰", "양말", "베개", "빗자루",
                "촛불", "텐트", "풍선", "비행기", "관람차", "신호등", "드럼세탁기"));

        BY_CATEGORY.put("장소·자연", List.of(
                "바다", "산", "무지개", "눈사람", "폭포", "사막", "화산", "등대",
                "놀이공원", "영화관", "편의점", "지하철", "캠핑장", "온천", "벚꽃",
                "단풍", "별똥별", "다리", "섬", "동굴"));

        BY_CATEGORY.put("행동·상황", List.of(
                "낮잠", "빨래", "설거지", "이사", "지각", "다이어트", "운동", "샤워",
                "머리감기", "요리", "청소", "산책", "등산", "낚시", "노래방", "면접",
                "주사맞기", "이빨빠짐", "재채기", "줄넘기"));

        BY_CATEGORY.put("우리 사이", List.of(
                "데이트", "손잡기", "커플티", "기념일", "영상통화", "화해", "선물",
                "첫만남", "밤샘수다", "같이먹기", "배웅", "사진찍기", "편지", "여행가방"));
    }

    private CatchMindWords() {
    }

    /**
     * 제시어 후보 — 서로 다른 카테고리에서 {@code count} 개.
     * 카테고리 수보다 많이 요구하면 있는 만큼만 돌려준다.
     */
    public static List<Candidate> candidates(Random random, int count) {
        List<String> categories = new ArrayList<>(BY_CATEGORY.keySet());
        Collections.shuffle(categories, random);

        List<Candidate> picked = new ArrayList<>(count);
        for (String category : categories) {
            if (picked.size() >= count) break;
            List<String> words = BY_CATEGORY.get(category);
            picked.add(new Candidate(category, words.get(random.nextInt(words.size()))));
        }
        return picked;
    }

    /** 전체 개수 — 콘텐츠가 얼마나 되는지 한눈에 보려고. 테스트가 하한을 잡는다. */
    public static int size() {
        return BY_CATEGORY.values().stream().mapToInt(List::size).sum();
    }

    public record Candidate(String category, String word) {
    }
}
