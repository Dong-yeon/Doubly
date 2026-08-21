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
 */
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['doubly://'],
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
              // 가이드/위시리스트/지도가 한 화면(Chip 세그먼트)으로 합쳐져 경로도 하나다
              PlaceMain: 'place',
              PlaceAdd: 'place/add',
              PlaceDetail: {
                path: 'place/:placeId',
                parse: { placeId: Number },
              },
            },
          },
        },
      },
    },
  } as LinkingOptions<RootStackParamList>['config'],
};
