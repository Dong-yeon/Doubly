/**
 * 운동 세션 로컬 복구 — 진행 중인 세션을 기기에 주기 스냅샷으로 남긴다.
 *
 * <p><b>왜 필요한가</b>: 세션은 "운동 완료"를 누르기 전까지 <b>전부 화면 메모리에만</b>
 * 있다. 앱이 크래시하거나 OS 가 백그라운드에서 프로세스를 정리하면 한 시간짜리 기록이
 * 통째로 사라진다 — 기록 앱에서 가장 나쁜 경험이다. 서버 세션(운동 v2)이 들어오기
 * 전까지 이 손실을 막는 저비용 선행 단계다.
 *
 * <p>저장소는 {@code AsyncStorage} 다. {@code utils/storage} 는 네이티브에서
 * SecureStore 를 쓰는데(토큰용) 값 크기 제한이 있어 세션 스냅샷에는 맞지 않는다.
 *
 * <p>초안은 <b>하루</b>만 산다. 어제 켜 둔 세션이 오늘 되살아나면 날짜가 어긋난 기록이
 * 만들어진다(저장은 항상 "오늘"로 나간다). 날짜가 다르면 조용히 버린다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SessionExerciseAlternativeParam, SessionExerciseParam } from '../../navigation/types';

const KEY = 'doubly.workoutSessionDraft';

/** 세트 1개의 입력 상태 — 화면이 들고 있는 문자열 그대로 저장한다(파싱은 저장 시점에만) */
export interface SessionSet {
  // React 리스트 key — 배열 인덱스를 key로 쓰면 중간 세트 삭제 시 잘못된 위치로 리마운트될
  // 수 있다(QA_CHECKLIST.md 패턴 9). optional인 이유: 이 필드가 생기기 전에 저장된 로컬
  // 초안(sessionDraft, 최대 하루 보관)을 복구할 때는 없을 수 있어 화면에서 인덱스로 보정한다.
  key?: string;
  weightKg: string;
  reps: string;
  done: boolean;
  // 세트 성격 — WARMUP/NORMAL/TOP/BACKOFF/DROP. 루틴에서 지정한 값을 그대로 들고 와 배지로만
  // 보여준다(합계·볼륨 계산에는 안 쓴다 — 백엔드 WorkoutRoutineExerciseSet.setType 주석과 동일 원칙).
  setType?: string;
  // 자각 강도(RPE) — 1.0~10.0, 직접 입력. 직전 수행 기록이 있으면 프리필된다(applyPrefill)
  rpe: string;
}

export interface SessionExercise {
  key: string;
  name: string;
  category: string;
  reps?: number;
  weightKg?: number;
  // 대체 종목 추천의 기준 — 루틴에서 시작했거나 이미 한 번 대체한 경우에만 채워짐
  muscleGroup?: string;
  equipment?: string;
  exerciseCatalogId?: number;
  // 이 종목만의 휴식 시간(초) — 없으면 세션 전역 기본값 사용(③)
  restSeconds?: number;
  // 루틴 작성 시 사전 지정해둔 대체 종목(④) — 세션 중 교체 시 먼저 추천된다
  alternatives?: SessionExerciseAlternativeParam[];
  // "이게 무슨 동작인지" 한 줄 설명 — tip 과 같은 배치 조회로 채워진다. tip 이 자세 교정 큐라면
  // 이건 그 앞 단계(동작 자체의 설명)라 대상 독자가 다르다.
  description?: string;
  // 카탈로그의 자세 큐/안내 문구 — 세션 시작 시 이름으로 배치 조회해 채운다. 커스텀 종목이거나
  // 아직 못 불러왔으면 undefined이고, 그때는 TIP 카드를 그냥 숨긴다.
  tip?: string;
  // 이 종목이 뭔지 한눈에 보여주는 이모지 — tip 과 같은 배치 조회로 채워진다
  emoji?: string;
  // 언제 숨을 내쉬고 마시는지 — TIP 카드에 tip 과 함께 항상 붙는 호흡 타이밍 문구
  breathingCue?: string;
  sets: SessionSet[];
}

export interface SessionDraft {
  /** 스냅샷 시각 (ISO) — "N분 전까지 하던 운동" 안내에 쓴다 */
  savedAt: string;
  /** 세션을 시작한 날 (로컬 YYYY-MM-DD) — 날이 바뀐 초안은 되살리지 않는다 */
  sessionDate: string;
  elapsedSec: number;
  restSeconds: number;
  /** 루틴에서 시작했다면 그 정보 — 복구 후에도 스마트 루틴 동기화가 그대로 동작해야 한다 */
  routineId?: number;
  routineTitle?: string;
  /** 세션 시작 시점의 루틴 구성 — 구성 변경 판정(hasCompositionChanged)의 기준 */
  originalExercises: SessionExerciseParam[];
  exercises: SessionExercise[];
}

/**
 * 되살릴 값이 있는 초안인지 — <b>종목이 하나라도 담겨 있으면</b> 되살린다.
 *
 * <p>예전엔 "체크한 세트가 하나라도 있어야" 였다. 그러면 종목을 담고 무게까지 채워둔 채
 * 탭을 잘못 눌러 나간 세션이 <b>되살릴 게 없는 것으로 취급돼 그대로 버려졌다</b> —
 * 실제로 그렇게 사라졌다. 종목을 담았다는 건 이미 운동을 시작했다는 뜻이고, 그때부터는
 * 사용자가 <b>운동 완료</b>나 <b>버리기</b>로 끝내기 전까지 앱이 들고 있어야 한다
 * (모델 설명은 {@code store/activeWorkoutStore} 주석 참고).
 */
export function hasProgress(draft: SessionDraft): boolean {
  return draft.exercises.length > 0;
}

export async function saveSessionDraft(draft: SessionDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // 저장 실패는 복구를 못 할 뿐 — 진행 중인 세션을 방해하지 않는다
  }
}

/**
 * 되살릴 초안 — 오늘 것이고 진행이 있는 경우에만 돌려준다.
 * 조건에 안 맞는 초안은 <b>여기서 지운다</b> — 남겨두면 다음 세션에서 매번 다시 검사한다.
 */
export async function loadSessionDraft(today: string): Promise<SessionDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as SessionDraft;
    if (draft.sessionDate !== today || !hasProgress(draft)) {
      await clearSessionDraft();
      return null;
    }
    return draft;
  } catch {
    // 형식이 깨진 초안 — 되살리려다 화면이 죽는 것보다 버리는 편이 낫다
    await clearSessionDraft();
    return null;
  }
}

export async function clearSessionDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // 지우기 실패 — 다음 세션 시작 때 날짜 검사에서 걸러진다
  }
}
