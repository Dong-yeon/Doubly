/**
 * 딥링크 · 웹 히스토리 연동 (WP2 — 스와이프 뒤로가기 복원).
 *
 * <p><b>왜 필요한가</b>: linking 설정이 없으면 react-navigation 은 웹에서
 * `history.pushState` 를 호출하지 않는다. 화면을 아무리 깊이 들어가도 브라우저
 * 히스토리는 1개라, 폰 브라우저/PWA 의 가장자리 스와이프(=브라우저 뒤로가기)가
 * <b>앱 전체 이탈</b>이 됐다. 경로 맵을 주면 화면마다 히스토리가 쌓여
 * 브라우저 뒤로가기·스와이프백이 화면 단위로 동작한다.
 *
 * <p>네이티브에서는 `doubly://` 스킴 딥링크(app.json 의 scheme)로도 동작한다.
 *
 * <p>주의: URL 파라미터는 문자열로 들어오므로 숫자 id 는 `parse` 로 변환한다.
 * `title` 같은 표시용 파라미터는 URL 에 싣지 않아 새로고침 시 비어 있을 수 있다 —
 * 각 화면이 id 로 데이터를 다시 불러오므로 동작에는 지장이 없다.
 *
 * <p><b>푸시 알림 탭도 여기로 들어온다</b>: 서버가 `data.link` 에 아래 경로 맵과 같은
 * 문자열을 실어 보내면(`com.fitto.common.notification.PushLinks`), `getInitialURL` ·
 * `subscribe` 가 그 앞에 스킴을 붙여 링크로 바꾼다. 알림 종류마다 화면 이동 코드를
 * 짜는 대신 이미 있는 경로 맵을 그대로 재사용하는 것 — 새 알림이 생겨도 서버가 경로
 * 문자열만 채우면 앱은 손댈 곳이 없다.
 */
import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const PREFIX = 'doubly://';

/**
 * 알림 payload 에서 열 링크를 꺼낸다.
 *
 * <p>payload 의 link 값은 서버가 보내는 경로 문자열이고, 빈 문자열은 <b>홈</b>을 뜻한다
 * (linking 의 `HomeMain: ''`). 그래서 `undefined` 와 `''` 를 구분해야 한다 —
 * 단순 falsy 검사로 걸러내면 홈으로 보내는 알림이 아무 데도 가지 않는다.
 */
function linkFrom(notification: Notifications.Notification | undefined | null): string | null {
  const link = notification?.request?.content?.data?.link;
  return typeof link === 'string' ? PREFIX + link : null;
}

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [PREFIX],

  /*
   * 알림을 탭해서 앱이 <b>처음 뜨는</b> 경우 — 콜드 스타트에는 아래 subscribe 리스너가
   * 아직 붙기 전이라 이벤트를 놓친다. react-navigation 이 초기 URL 을 물어볼 때
   * 마지막 알림 응답을 대신 돌려준다.
   *
   * 웹에서는 이 훅을 건드리지 않는다 — 기본 구현이 `window.location` 을 읽어
   * 브라우저 히스토리 연동(위 주석)을 만드는데, 여기서 가로채면 그게 깨진다.
   */
  async getInitialURL() {
    /*
     * 150ms 레이스는 react-navigation 기본 구현을 그대로 옮긴 것이다 — Android 에서
     * Linking.getInitialURL() 이 영영 resolve 되지 않는 경우가 있어(RN #25675), 이걸
     * 빼면 앱이 첫 화면 없이 멈춘다. 이 훅을 덮어쓰는 이상 그 방어도 같이 가져와야 한다.
     */
    const url = await Promise.race([
      Linking.getInitialURL(),
      new Promise<undefined>((resolve) => setTimeout(resolve, 150)),
    ]);
    if (url != null) return url;
    if (Platform.OS === 'web') return null;
    try {
      return linkFrom((await Notifications.getLastNotificationResponseAsync())?.notification);
    } catch {
      // Expo Go 등 알림 모듈이 없는 환경 — 딥링크 없이 그냥 뜬다
      return null;
    }
  },

  /* 앱이 떠 있는 동안(백그라운드 포함) 알림을 탭한 경우. */
  subscribe(listener) {
    const urlSub = Linking.addEventListener('url', ({ url }) => listener(url));
    if (Platform.OS === 'web') {
      return () => urlSub.remove();
    }
    let notificationSub: ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | undefined;
    try {
      notificationSub = Notifications.addNotificationResponseReceivedListener((response) => {
        const url = linkFrom(response.notification);
        if (url != null) listener(url);
      });
    } catch {
      // 알림 모듈이 없는 환경 — URL 딥링크만 동작한다
    }
    return () => {
      urlSub.remove();
      notificationSub?.remove();
    };
  },

  /*
   * config 를 통째로 캐스팅하는 이유 — 각 탭 블록의 `initialRouteName` 때문이다.
   * v7 의 `PathConfigMap` 은 중첩 내비게이터의 파람리스트를 `NavigatorScreenParams<infer T>`
   * 로 되찾으려 하는데, 그 타입이 매핑된 유니온이라 추론이 `{}` 로 떨어진다 →
   * `initialRouteName?: keyof {}` = never 가 돼 어떤 화면 이름도 못 넣는다(플레인 타입인
   * Chat·Diet 블록도 똑같이 거부되므로 이 파일 쪽 타입 문제가 아니다). 값 자체는 아래에서
   * 각 스택의 실제 첫 화면 이름으로 정확히 맞춰 뒀다.
   */
  config: {
    screens: {
      Onboarding: {
        // 딥링크로 /register·/forgot-password·/legal 로 들어와도 아래에 로그인 화면이 깔린다
        // (없으면 그 화면 하나뿐이라 '로그인으로 돌아가기'(goBack)가 아무 일도 하지 않았다)
        initialRouteName: 'Login',
        screens: {
          Splash: 'splash',
          Onboarding: 'intro',
          Login: 'login',
          Register: 'register',
          ForgotPassword: 'forgot-password',
          ResetPassword: 'reset-password',
          LegalDocument: 'legal/:doc',
        },
      },
      ConsentGate: 'consent',
      Main: {
        screens: {
          /*
           * initialRouteName — 딥링크·웹 새로고침으로 <b>깊은 화면</b>이 열릴 때 그 아래에
           * 탭의 첫 화면을 깔아둔다. 없으면 그 탭 스택이 도착 화면 <b>하나</b>로만 만들어져
           * 뒤로가기 버튼도 없고(탭 재탭의 popToTop 도 할 일이 없다) 그 세션 동안 탭의 첫
           * 화면으로 못 돌아간다 — doubly://trips/5 로 열면 홈 화면 자체가 사라지는 식이다.
           */
          Home: {
            initialRouteName: 'HomeMain',
            screens: {
              HomeMain: '',
              CoupleConnect: 'couple/connect',
              FeedTimeline: 'feed',
              FeedCompose: 'feed/new',
              DailyQuestion: 'question',
              CoupleCalendar: 'calendar',
              PhotoAlbum: 'album',
              My: 'my',
              Settings: 'settings',
              ChangePassword: 'settings/password',
              // 온보딩 스택의 legal/:doc 과 경로가 겹치지 않게 구분한다
              LegalDocument: 'legal-doc/:doc',
              TrainerRegister: 'trainer/register',
              TrainerDashboard: 'trainer',
              TrainerMemberDetail: {
                path: 'trainer/member/:memberId',
                parse: { memberId: Number },
              },
              TrainerRoutineAssign: {
                path: 'trainer/member/:memberId/assign',
                parse: { memberId: Number },
              },
              TrainerConnect: 'trainer/connect',
              /*
               * 여행 — 장소(Place) 스택에서 이관. 경로 문자열은 그대로 둔다:
               * 이미 배포된 딥링크·브라우저 북마크(doubly://trips/*)가 계속 열려야 한다.
               */
              TripList: 'trips',
              TripForm: 'trips/form',
              TripDetail: {
                path: 'trips/:tripId',
                parse: { tripId: Number },
              },
              TripExpense: {
                path: 'trips/:tripId/expense',
                parse: { tripId: Number },
              },
              TripChecklist: {
                path: 'trips/:tripId/checklist',
                parse: { tripId: Number },
              },
              TripAlbum: {
                path: 'trips/:tripId/album',
                parse: { tripId: Number },
              },
              TripRecap: {
                path: 'trips/:tripId/recap',
                parse: { tripId: Number },
              },
              /*
               * 여행에서 연 장소 화면 — 럽슐랭 탭에도 같은 화면이 있지만 <b>경로는 나눈다</b>.
               * 경로가 없으면 getPathFromState 가 라우트 이름을 그대로 URL 에 박아
               * (`/PlaceDetail?placeId=3`) 새로고침 때 복원에 실패해 홈으로 튕겼다.
               * 같은 'place/:placeId' 를 두 블록에 쓰면 어느 탭으로 복원될지 모호해지므로,
               * 여행 쪽은 trips/ 아래에 둬 새로고침해도 홈 스택으로 돌아온다.
               */
              PlaceDetail: {
                path: 'trips/place/:placeId',
                parse: { placeId: Number },
              },
              PlaceAdd: 'trips/place/edit',
            },
          },
          Workout: {
            initialRouteName: 'WorkoutMain',
            screens: {
              WorkoutMain: 'workout',
              WorkoutRecord: 'workout/record',
              WorkoutCalendar: 'workout/calendar',
              WorkoutDetail: {
                path: 'workout/records/:workoutId',
                parse: { workoutId: Number },
              },
              WorkoutStats: 'workout/stats',
              WorkoutRecommend: 'workout/recommend',
              WorkoutSession: 'workout/session',
              WorkoutRoutines: 'workout/routines',
              WorkoutProgramDetail: {
                path: 'workout/routines/programs/:programId',
                parse: { programId: Number },
              },
              WorkoutRoutineForm: 'workout/routines/new',
              BodyMetric: 'workout/body',
              Challenge: 'workout/challenge',
              VoiceClips: 'workout/voice-clips',
            },
          },
          Chat: {
            initialRouteName: 'ChatRooms',
            screens: {
              ChatRooms: 'chat',
              ChatRoom: {
                path: 'chat/:relationId',
                parse: { relationId: Number },
              },
            },
          },
          Diet: {
            initialRouteName: 'DietMain',
            screens: {
              DietMain: 'diet',
              DietRecord: 'diet/record',
              DietCalendar: 'diet/calendar',
              DietStats: 'diet/stats',
            },
          },
          Place: {
            initialRouteName: 'PlaceMain',
            screens: {
              // 가이드/둘러보기(목록·지도)/콘텐츠가 한 화면(Chip 세그먼트)으로 합쳐져 경로도 하나다
              PlaceMain: 'place',
              PlaceAdd: 'place/add',
              PlaceDetail: {
                path: 'place/:placeId',
                parse: { placeId: Number },
              },
              // 콘텐츠(영화·공연·드라마) — Place 와 별개 도메인이지만 같은 탭 안이라 경로도 옆에 둔다
              ContentAdd: 'place/content/add',
              ContentDetail: {
                path: 'place/content/:contentId',
                parse: { contentId: Number },
              },
            },
          },
        },
      },
    },
  } as LinkingOptions<RootStackParamList>['config'],
};
