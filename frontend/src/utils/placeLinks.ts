/**
 * 장소 외부 링크 — 카카오·네이버 검색 URL, 앱 안 브라우저로 열기, 전화.
 *
 * <p>카카오 <b>상세</b> 링크(place.map.kakao.com/{id})는 서버가 만든다(PlaceLinks.java, 응답 detailUrl) — 여기서 다시 만들지 않는다.
 * 여기 있는 건 상세 id 가 없을 때(직접 추가한 곳)의 <b>검색</b> 링크뿐이다. 형식과 고른 이유는
 * docs/LOVELICHELIN_PLACE_INFO_2026-10-06.md.
 *
 * <p><b>왜 앱 안 브라우저인가</b>: 메뉴·사진은 카카오·네이버 모두 공개 API 가 없다. 그 페이지를 앱을 떠나지 않고 보게 하는 게
 * 지금 할 수 있는 가장 가까운 "네이버지도처럼"이다. expo-web-browser 는 이미 의존성이고 네이티브 모듈이 빌드에 들어 있어
 * (구글 로그인이 쓴다) 빌드 없이 쓸 수 있다. 앱 스킴(kakaomap://)은 쓰지 않는다 — 앱이 없는 사람에게 깨진다.
 */
import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { toast } from '../store/toastStore';

/** 주소에서 동네 — "서울 마포구 연남동 239-1" → "연남동". 동이 없는 도로명 주소면 구("마포구"), 그마저 없으면 null */
export function neighborhoodOf(address?: string | null): string | null {
  if (!address) return null;
  const tokens = address.trim().split(/\s+/);
  const dong = tokens.find((t) => /(동|읍|면|리|\d가)$/.test(t) && !/^\d/.test(t));
  if (dong) return dong;
  return tokens.find((t) => /(구|군)$/.test(t)) ?? null;
}

/** 주소의 구까지 — "서울 중구 충무로14길 2-1" → "서울 중구". 검색어를 너무 좁히지 않으려고 번지·도로명은 뺀다 */
export function districtOf(address?: string | null): string {
  if (!address) return '';
  const tokens = address.trim().split(/\s+/);
  const i = tokens.findIndex((t) => /(구|군)$/.test(t));
  if (i >= 0) return tokens.slice(0, i + 1).join(' ');
  const j = tokens.findIndex((t) => /시$/.test(t));
  return j >= 0 ? tokens.slice(0, j + 1).join(' ') : '';
}

/** 검색 결과·후보 한 줄 부제 — "한식 · 냉면 · 연남동". 없는 칸은 건너뛴다(이름은 따로 굵게 보인다) */
export function placeSubtitle(p: { categoryDetail?: string | null; category?: string | null; address?: string | null }): string {
  return [p.categoryDetail ?? p.category, neighborhoodOf(p.address)].filter(Boolean).join(' · ');
}

function query(name: string, address?: string | null): string {
  return encodeURIComponent([name, districtOf(address)].filter(Boolean).join(' '));
}

/**
 * 카카오맵 검색 — 상세 링크(detailUrl)가 없을 때. 모바일은 m.map.kakao.com — map.kakao.com 은 모바일 브라우저에서
 * 앱 설치 안내(applink)로 넘겨 버린다(2026-10-06 확인).
 */
export function kakaoSearchUrl(name: string, address?: string | null): string {
  const q = query(name, address);
  return Platform.OS === 'web' ? `https://map.kakao.com/?q=${q}` : `https://m.map.kakao.com/actions/searchView?q=${q}`;
}

/** 네이버 지도 검색 — 이름 + 주소의 구까지. 모바일 웹은 m.map.naver.com, PC 는 map.naver.com/p/search */
export function naverSearchUrl(name: string, address?: string | null): string {
  const q = query(name, address);
  return Platform.OS === 'web' ? `https://map.naver.com/p/search/${q}` : `https://m.map.naver.com/search?query=${q}`;
}

/**
 * 앱 안 브라우저로 연다 — iOS SFSafariViewController / Android Custom Tab, 툴바는 앱 색.
 * 웹은 expo-web-browser 가 팝업 창(창 크기 지정)으로 여므로 쓰지 않고 새 탭으로 연다. 팝업이 막혔으면 알린다.
 * 앱 안 브라우저를 못 열면 외부 브라우저(Linking)로 대신 연다.
 */
export async function openInAppBrowser(url: string, colors: { toolbar: string; controls: string }): Promise<void> {
  if (Platform.OS === 'web') {
    const w = window.open(url, '_blank');
    if (w) {
      w.opener = null;
    } else {
      toast.error('팝업이 막혀 새 탭을 열지 못했어요. 브라우저에서 이 사이트의 팝업을 허용해 주세요.');
    }
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: colors.toolbar,
      controlsColor: colors.controls,
      dismissButtonStyle: 'close',
      enableBarCollapsing: true,
    });
  } catch {
    toast.info('앱 안에서 열지 못해 브라우저로 열어요.');
    try {
      await Linking.openURL(url);
    } catch {
      toast.error('링크를 열지 못했어요.');
    }
  }
}

/**
 * 전화 — tel: 은 Linking. canOpenURL 은 쓰지 않는다: Android 11+ 는 매니페스트에 <queries> 가 없으면 false 를 돌려줘
 * 멀쩡한 폰에서도 "못 건다"고 말한다(그걸 넣으려면 app.json = 빌드). 열어 보고 실패하면 알린다.
 */
export async function callPhone(phone: string): Promise<void> {
  const digits = phone.replace(/[^0-9+]/g, '');
  if (!digits) return;
  try {
    await Linking.openURL(`tel:${digits}`);
  } catch {
    toast.error('이 기기에서는 전화를 걸 수 없어요.');
  }
}
