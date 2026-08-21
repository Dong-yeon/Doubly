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
  config: {
    screens: {
      Onboarding: {
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
          Home: {
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
            },
          },
          Workout: {
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
            screens: {
              ChatRooms: 'chat',
              ChatRoom: {
                path: 'chat/:relationId',
                parse: { relationId: Number },
              },
            },
          },
          Diet: {
            screens: {
              DietMain: 'diet',
              DietRecord: 'diet/record',
              DietCalendar: 'diet/calendar',
              DietStats: 'diet/stats',
            },
          },
          Place: {
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
  },
};
