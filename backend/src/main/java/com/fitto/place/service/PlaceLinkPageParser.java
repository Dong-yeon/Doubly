package com.fitto.place.service;

import com.fitto.place.service.PlaceLinkHosts.Provider;

import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 정본 장소 페이지에서 가게 이름(og:title)과 주소 힌트를 꺼낸다 — HTML 파서 없이 정규식으로.
 * 필요한 건 head 의 meta 몇 줄뿐이고, 본문은 512KB 에서 잘려 와 DOM 으로 온전하지 않을 수 있다.
 *
 * <p>2026-10-02 실측:
 * <ul>
 *   <li>카카오 place.map.kakao.com/{id}: og:title = "누데이크 성수", og:description = 주소</li>
 *   <li>네이버 m.place.naver.com/…/{id}/home: og:title = "못 MOAT : 네이버", og:description 은 리뷰 수라
 *       주소가 아니다. 주소는 페이지 JSON 의 "roadAddress" 에 있다.</li>
 *   <li>지도 화면(map.kakao.com·map.naver.com)의 og:title 은 서비스 이름뿐이다 — 이름으로 쓰지 않는다.</li>
 * </ul>
 */
public final class PlaceLinkPageParser {

    private PlaceLinkPageParser() {
    }

    public record Parsed(String title, String addressHint) {
    }

    /** 가게 이름이 아니라 서비스 이름인 og:title — 이걸로 검색하면 엉뚱한 곳이 나온다 */
    private static final Set<String> GENERIC_TITLES = Set.of("카카오맵", "kakaomap", "네이버지도", "네이버 지도",
            "네이버 플레이스", "네이버", "naver", "naver map");

    private static final Pattern META_TAG = Pattern.compile("<meta\\s[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ATTR = Pattern.compile("([a-zA-Z:_-]+)\\s*=\\s*(\"([^\"]*)\"|'([^']*)')");
    private static final Pattern NAVER_ROAD_ADDRESS = Pattern.compile("\\\\?\"roadAddress\\\\?\"\\s*:\\s*\\\\?\"([^\"\\\\]{2,120})");
    private static final Pattern NUMERIC_ENTITY = Pattern.compile("&#(x?)([0-9a-fA-F]{1,6});");

    public static Parsed parse(String html, Provider provider) {
        if (html == null || html.isEmpty()) {
            return new Parsed(null, null);
        }
        String title = cleanTitle(meta(html, "og:title"), provider);
        String address = null;
        if (provider == Provider.KAKAO) {
            address = blankToNull(meta(html, "og:description"));
        } else if (provider == Provider.NAVER) {
            Matcher m = NAVER_ROAD_ADDRESS.matcher(html);
            if (m.find()) {
                address = blankToNull(decodeEntities(m.group(1)));
            }
        }
        return new Parsed(title, address);
    }

    /** 지도 앱 공유 문구의 머리표 — "[네이버 지도]", "[카카오맵]" */
    private static final Pattern SHARE_TAG = Pattern.compile(
            "^\\[\\s*(네이버\\s*지도|카카오\\s*맵|naver\\s*map|kakao\\s*map)\\s*]\\s*", Pattern.CASE_INSENSITIVE);
    /**
     * 주소 줄 — 광역 지자체(+행정 접미사) 다음에 시·군·구가 온다. "서울숲 카페"처럼 지명으로 시작하는 가게
     * 이름을 주소로 잘못 읽지 않게 두 번째 말이 시·군·구로 끝나야 한다.
     */
    private static final Pattern ADDRESS_LINE = Pattern.compile(
            "^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|충청북도|충청남도|전북|전남|전라북도|전라남도|경북|경남|경상북도|경상남도|제주)"
                    + "(특별시|광역시|특별자치시|특별자치도|도)?\\s+\\S+(시|군|구)(\\s|$)");
    private static final Pattern URL_IN_TEXT = Pattern.compile("(https?://|www\\.)\\S+", Pattern.CASE_INSENSITIVE);
    private static final int MAX_SHARE_NAME = 50;

    /**
     * 공유 메시지에서 이름·주소를 꺼낸다 — 페이지에서 못 읽었을 때의 차선.
     *
     * <p><b>지도 앱이 만든 공유 문구일 때만</b> 믿는다: 머리표("[네이버 지도]")가 있거나 주소 줄이 있어야 한다.
     * "여기 가보자 https://naver.me/…" 같은 평범한 대화를 이름으로 검색하면 엉뚱한 가게가 후보로 뜬다.
     */
    public static Parsed fromShareText(String text) {
        if (text == null || text.isBlank()) {
            return new Parsed(null, null);
        }
        boolean tagged = false;
        String name = null;
        String address = null;
        for (String rawLine : URL_IN_TEXT.matcher(text).replaceAll(" ").split("\\R")) {
            String line = rawLine.trim();
            Matcher tag = SHARE_TAG.matcher(line);
            if (tag.find()) {
                tagged = true;
                line = line.substring(tag.end()).trim();
            }
            if (line.isEmpty()) {
                continue;
            }
            if (address == null && ADDRESS_LINE.matcher(line).find()) {
                address = line;
            } else if (name == null) {
                name = line;
            }
        }
        if (!tagged && address == null) {
            return new Parsed(null, null);
        }
        if (name == null || name.length() > MAX_SHARE_NAME) {
            return new Parsed(null, address);
        }
        return new Parsed(name, address);
    }

    /** 주소에서 검색어에 붙일 앞부분 — "서울 성동구 성수동2가 309-59 1층" → "서울 성동구" */
    public static String regionOf(String address) {
        if (address == null) {
            return null;
        }
        String[] parts = address.trim().split("\\s+");
        if (parts.length < 2) {
            return null;
        }
        return parts[0] + " " + parts[1];
    }

    static String meta(String html, String property) {
        Matcher tags = META_TAG.matcher(html);
        while (tags.find()) {
            String tag = tags.group();
            String key = null;
            String content = null;
            Matcher attrs = ATTR.matcher(tag);
            while (attrs.find()) {
                String name = attrs.group(1).toLowerCase();
                String value = attrs.group(3) != null ? attrs.group(3) : attrs.group(4);
                if (name.equals("property") || name.equals("name")) {
                    key = value;
                } else if (name.equals("content")) {
                    content = value;
                }
            }
            if (property.equalsIgnoreCase(key) && content != null) {
                return decodeEntities(content).trim();
            }
        }
        return null;
    }

    private static String cleanTitle(String raw, Provider provider) {
        String title = blankToNull(raw);
        if (title == null) {
            return null;
        }
        if (provider == Provider.NAVER) {
            title = title.replaceFirst("\\s*[:|\\-]\\s*네이버(\\s*(지도|플레이스))?\\s*$", "").trim();
        } else if (provider == Provider.KAKAO) {
            title = title.replaceFirst("\\s*[:|\\-]\\s*카카오맵\\s*$", "").trim();
        }
        if (title.isEmpty() || GENERIC_TITLES.contains(title.toLowerCase())) {
            return null;
        }
        // 카카오 장소 이름 상한(100자, SavePlaceRequest)과 맞춘다
        return title.length() > 100 ? title.substring(0, 100) : title;
    }

    static String decodeEntities(String s) {
        if (s == null || s.indexOf('&') < 0) {
            return s;
        }
        Matcher m = NUMERIC_ENTITY.matcher(s);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            int code;
            try {
                code = Integer.parseInt(m.group(2), m.group(1).isEmpty() ? 10 : 16);
            } catch (NumberFormatException e) {
                code = -1;
            }
            String replacement = code > 0 && Character.isValidCodePoint(code) ? new String(Character.toChars(code)) : "";
            m.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        m.appendTail(out);
        return out.toString()
                .replace("&quot;", "\"")
                .replace("&apos;", "'")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&nbsp;", " ")
                .replace("&amp;", "&");
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
