/** 운동 세션 보조 (Jefit/Strong 스타일) — 세트별 무게·횟수 입력 + 완료 체크 + 휴식 타이머.
 *  종료하면 완료한 세트가 운동 기록으로 저장된다. 루틴으로 실행 시 exercises 파라미터로 시작.
 *  입력 동선 최소화: 종목의 직전 수행 기록(무게·횟수)을 자동으로 불러와 기본 입력값으로 채워두므로,
 *  실제 운동 시에는 값이 다르지 않은 한 '완료' 버튼만 누르면 된다. */
import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DragList, { type DragListRenderItemInfo } from 'react-native-draglist';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  SessionExerciseAlternativeParam,
  SessionExerciseParam,
  WorkoutStackParamList,
} from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { MuscleBodyBadge } from '../../components/MuscleBodyBadge';
import { ExercisePickerModal } from '../../components/workout/ExercisePickerModal';
import { useWorkoutStore } from '../../store/workoutStore';
import { workoutApi } from '../../api/workout';
import { voiceClipsApi } from '../../api/voiceClips';
import { playVoiceClip } from '../../utils/voicePlayback';
import { getErrorMessage } from '../../utils/error';
import { toDateString } from '../../utils/date';
import {
  clearSessionDraft,
  loadSessionDraft,
  saveSessionDraft,
  type SessionDraft,
  type SessionExercise,
  type SessionSet,
} from './sessionDraft';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { useAndroidKeyboardHeight } from '../../hooks/useAndroidKeyboardHeight';
import { confirmDiscard } from '../../utils/discardGuard';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { formatNumber, formatWeight } from '../../utils/format';
import { sanitizeDecimalInput, sanitizeIntegerInput } from '../../utils/numericInput';
import type {
  ExerciseCatalogItem,
  ExerciseLastPerformance,
  VoicePhrase,
  WorkoutBooster as WorkoutBoosterType,
} from '../../types';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutSession'>;

const CATEGORIES = ['근력', '유산소', '유연성'];
const REST_PRESETS = [60, 90, 120];
/** 세션 스냅샷 주기(ms) — 최악의 손실이 이 값이다. 더 짧게 하면 디스크 쓰기만 늘어난다 */
const SNAPSHOT_INTERVAL_MS = 10_000;

/*
 * SessionSet · SessionExercise 는 sessionDraft 모듈에 있다 — 크래시 복구가 이 모양을
 * 그대로 저장하므로, 화면과 초안이 서로 다른 타입을 들면 복구가 조용히 깨진다.
 */

let keySeq = 0;
const nextKey = () => `ex-${keySeq++}`;
const nextSetKey = () => `set-${keySeq++}`;

/** "32분째 · 5세트 완료" — 이어서 할지 정하려면 얼마나 했는지가 필요하다 */
function describeDraft(draft: SessionDraft): string {
  const minutes = Math.max(1, Math.round(draft.elapsedSec / 60));
  const done = draft.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  return `${minutes}분째 · ${done}세트 완료`;
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 문자열 입력값 → 숫자. 빈 값/숫자가 아니면 undefined */
function toNum(s: string): number | undefined {
  const trimmed = s.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isNaN(n) ? undefined : n;
}

/**
 * 동작 영상 보기 — 유튜브 <b>검색 결과</b>로 보낸다(특정 영상을 지정하지 않는다).
 * 시범 영상 자체를 앱에 담는 건 저작권·용량 때문에 Non-goal 이고(PLAN.md), 대신 외부 링크로
 * 대체하기로 돼 있다. 특정 영상을 박아두면 그 영상이 내려갔을 때 죽은 링크가 되므로 검색으로 연다.
 * 실패해도(브라우저가 없는 환경 등) 세션 진행에는 지장이 없으므로 조용히 무시한다.
 */
function openFormVideo(exerciseName: string): void {
  const q = encodeURIComponent(`${exerciseName} 운동 자세`);
  Linking.openURL(`https://www.youtube.com/results?search_query=${q}`).catch(() => undefined);
}

/** Epley 공식 추정 1RM — 1회만 했으면 그 무게 자체가 1RM */
function estimate1RM(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** 종목의 e1RM — 완료된 본세트 중 추정치가 가장 높은 세트 기준. 웜업 세트는 전력이 아니라
 *  1RM 추정에 넣으면 값을 왜곡하므로 제외한다(가벼운 워밍업 세트에 안 낮아지게). */
function bestE1RM(sets: SessionSet[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (!s.done || s.setType === 'WARMUP') continue;
    const w = toNum(s.weightKg);
    const r = toNum(s.reps);
    if (w == null || r == null || w <= 0 || r <= 0) continue;
    const e = estimate1RM(w, r);
    if (best == null || e > best) best = e;
  }
  return best;
}

function buildSet(weightKg?: number | null, reps?: number | null, setType?: string | null): SessionSet {
  return {
    key: nextSetKey(),
    weightKg: weightKg != null ? String(weightKg) : '',
    reps: reps != null ? String(reps) : '',
    done: false,
    setType: setType ?? undefined,
    rpe: '',
  };
}

/**
 * 기구별 무게 증가폭(kg) — 규칙 기반 무게 추천의 기준(PLAN.md "중량·세트 추천" 참고).
 * 바벨은 상체보다 하체가 훨씬 강해 증가폭이 더 크다. 맨몸운동은 무게를 얹는 대상이 아니라
 * null(추천 안 함) — 맨몸은 횟수로 늘리는 게 자연스러운 진행이다.
 */
function weightStep(equipment: string | undefined, muscleGroup: string | undefined): number | null {
  switch (equipment) {
    case '바벨':
      return muscleGroup === '하체' ? 5 : 2.5;
    case '덤벨':
      return 2;
    case '머신':
    case '케이블':
      return 2.5;
    case '맨몸':
      return null;
    default:
      // 기구 정보가 없는 종목(직접 추가 등)은 보수적인 기본값을 쓴다
      return 2.5;
  }
}

/**
 * 직전 세트의 RPE로 다음 무게를 제안한다 — 규칙 기반 더블 프로그레션, AI 호출 없음
 * (PLAN.md "중량·세트 추천" 참고. 다만 목표 횟수 미달/2연속 미달 디로드는 이전 세션이 하나만
 * 있어 판단할 수 없어 이번 범위에서는 뺐다 — 미달 시엔 그냥 같은 무게를 유지한다).
 *
 * - RPE ≤ 8(= 여유 2회 이상) → 다음엔 무게를 올린다
 * - RPE 9~10(거의 실패) → 같은 무게를 유지(횟수부터 채우게)
 * - RPE를 안 남겼으면 판단 근거가 없어 손대지 않는다(예전처럼 그대로 이어받는다)
 */
function suggestNextWeight(
  lastWeight: number,
  rpe: number | null | undefined,
  equipment: string | undefined,
  muscleGroup: string | undefined,
): number {
  if (rpe == null || rpe >= 9) return lastWeight;
  const step = weightStep(equipment, muscleGroup);
  if (step == null) return lastWeight;
  // 0.5kg 단위로 반올림 — 원판 최소 단위와 어긋나는 72.83kg 같은 값을 피한다
  return Math.round((lastWeight + step) * 2) / 2;
}

/** 종목의 직전 수행 기록으로 세트 배열을 채운다 — 세트별 실제 기록(entries)이 있으면 그 값을,
 *  없으면 직전 종목 평균값을 기본값으로 쓴다. 이미 체크된 세트는 건드리지 않는다.
 *  무게는 그대로 복사하지 않고 직전 RPE로 다음 무게를 제안한다(suggestNextWeight).
 *  RPE는 종목 평균값이 따로 없어(주관적 체감치라 평균 낼 이유가 없다) 세트별 기록만 프리필한다. */
function applyPrefill(
  sets: SessionSet[],
  perf: ExerciseLastPerformance,
  equipment?: string,
  muscleGroup?: string,
): SessionSet[] {
  return sets.map((s, i) => {
    if (s.done) return s;
    const entry = perf.entries[i];
    const weightKg = entry?.weightKg ?? perf.weightKg;
    const reps = entry?.reps ?? perf.reps;
    const rpe = entry?.rpe;
    const nextWeight = weightKg != null ? suggestNextWeight(weightKg, rpe, equipment, muscleGroup) : weightKg;
    return {
      ...s,
      weightKg: nextWeight != null ? String(nextWeight) : s.weightKg,
      reps: reps != null ? String(reps) : s.reps,
      rpe: entry?.rpe != null ? String(entry.rpe) : s.rpe,
    };
  });
}

/**
 * 세션 시작 시점의 루틴 구성과 지금 화면의 구성이 다른지 — 스마트 루틴 동기화(①)의 트리거.
 * 종목 자체가 바뀌었거나(대체/추가/삭제) 세트 수가 달라졌을 때만 true. 무게·횟수 값 차이는
 * 매 세션 자연스레 달라지는 수행 기록이라 여기서는 비교하지 않는다(루틴 "구성"만 본다).
 */
function hasCompositionChanged(original: SessionExerciseParam[], current: SessionExercise[]): boolean {
  if (original.length !== current.length) return true;
  return original.some((o, i) => {
    const c = current[i];
    if (!c || o.name !== c.name) return true;
    const originalSetCount = Math.max(1, o.targetSets ?? 3);
    return originalSetCount !== c.sets.length;
  });
}

/** ② 자유 세션을 새 루틴으로 저장할 때의 기본 이름 제안 — 피드 카드("스쿼트 외 1개")와 같은 문구 */
function suggestRoutineTitle(exercises: SessionExercise[]): string {
  if (exercises.length === 0) return '';
  if (exercises.length === 1) return exercises[0].name;
  return `${exercises[0].name} 외 ${exercises.length - 1}개`;
}

export function WorkoutSessionScreen({ navigation, route }: Props) {
  const save = useWorkoutStore((s) => s.save);

  const [exercises, setExercises] = useState<SessionExercise[]>(() =>
    (route.params?.exercises ?? []).map((e) => ({
      key: nextKey(),
      name: e.name,
      category: e.category ?? '근력',
      reps: e.reps ?? undefined,
      weightKg: e.weightKg ?? undefined,
      muscleGroup: e.muscleGroup ?? undefined,
      equipment: e.equipment ?? undefined,
      exerciseCatalogId: e.exerciseCatalogId ?? undefined,
      restSeconds: e.restSeconds ?? undefined,
      alternatives: e.alternatives,
      // 세트별 목표(램프업/백오프 등)가 있으면 세트마다 다른 무게·횟수로 시작한다.
      // 없으면 지금처럼 종목 단위 값으로 목표 세트수만큼 균등 분배한다.
      sets:
        e.sets && e.sets.length > 0
          ? e.sets.map((s) => buildSet(s.weightKg, s.reps, s.setType))
          : Array.from({ length: Math.max(1, e.targetSets ?? 3) }, () => buildSet(e.weightKg, e.reps)),
    })),
  );

  /** 방금 재생한 부스터 — 상단에 "누가 보낸 응원인지" 한 줄로 띄운다 */
  const [booster, setBooster] = useState<WorkoutBoosterType | null>(null);
  /** 마지막 세트 응원을 이미 울렸는지 — 세션당 한 번 */
  const lastSetCheeredRef = useRef(false);

  const [restSeconds, setRestSeconds] = useState(90);
  const [rest, setRest] = useState(0); // 남은 휴식 초
  const [saving, setSaving] = useState(false);

  /*
   * 루틴 맥락 — 보통은 route.params 그대로지만, 크래시 복구로 되살린 세션은 초안에
   * 담긴 값이 진짜다(그때의 params 는 이미 사라졌다). 상태로 들고 있어야 복구 후에도
   * 스마트 루틴 동기화(구성 변경 → 템플릿 반영 제안)가 원래대로 동작한다.
   */
  const [routineCtx, setRoutineCtx] = useState<{
    routineId?: number;
    routineTitle?: string;
    original: SessionExerciseParam[];
  }>(() => ({
    routineId: route.params?.routineId,
    routineTitle: route.params?.routineTitle,
    original: route.params?.exercises ?? [],
  }));

  /*
   * 세션 경과 시간 — 상단 요약바 "운동 시간"과 저장되는 totalDurationMin 의 기준이다.
   *
   * <b>1초씩 더해나가는 카운터가 아니라 시작 시각 기준으로 매번 다시 계산한다.</b>
   * setInterval로 누적하면 세트 사이에 폰을 잠그거나 앱이 백그라운드로 밀려날 때(운동 중
   * 흔한 일이다) JS 타이머가 멈추거나 스로틀돼 실제로 흐른 시간보다 적게 기록된다.
   * sessionStartRef 는 "elapsedSec = 0" 에 대응하는 벽시계 시각이고, elapsedSec 은 매 틱마다
   * Date.now() - sessionStartRef 로 다시 구해 항상 실제 경과 시간과 일치시킨다.
   */
  const sessionStartRef = useRef<number>(Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);
  const tickElapsed = () => setElapsedSec(Math.floor((Date.now() - sessionStartRef.current) / 1000));
  useEffect(() => {
    const id = setInterval(tickElapsed, 1000);
    // 백그라운드에서 돌아온 순간 다음 틱(최대 1초)을 기다리지 않고 바로 맞춘다 —
    // 오래 잠갔다 켰을 때 "아직 그대로네" 하는 순간이 없게.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tickElapsed();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);

  /*
   * 크래시 복구 — 남아 있는 초안이 있는지 먼저 확인하고, 그 결정이 끝나기 전에는
   * 프리필(직전 기록·TIP)을 시작하지 않는다. 순서가 뒤집히면 되살린 무게 위에
   * 지난주 기록이 덮어써진다.
   */
  const [restoreChecked, setRestoreChecked] = useState(false);
  // 되살린 세션에는 프리필을 아예 하지 않는다 — 이미 사용자가 입력한 값이 들어 있다
  const restoredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setRestoreChecked(true);
    };
    void loadSessionDraft(toDateString())
      .then((draft) => {
        if (cancelled) return finish();
        if (!draft) return finish();
        Alert.alert(
          '하던 운동이 남아 있어요',
          `${describeDraft(draft)}\n이어서 할까요?`,
          [
            {
              text: '새로 시작',
              style: 'cancel',
              onPress: () => {
                void clearSessionDraft();
                finish();
              },
            },
            {
              text: '이어서 하기',
              onPress: () => {
                restoredRef.current = true;
                setExercises(draft.exercises);
                // 되살린 경과 시간에 맞춰 기준 시각을 다시 잡는다 — 이걸 안 하면 다음 틱에서
                // sessionStartRef(화면 진입 시각) 기준으로 재계산돼 되살린 값이 바로 덮인다.
                sessionStartRef.current = Date.now() - draft.elapsedSec * 1000;
                setElapsedSec(draft.elapsedSec);
                setRestSeconds(draft.restSeconds);
                setRoutineCtx({
                  routineId: draft.routineId,
                  routineTitle: draft.routineTitle,
                  original: draft.originalExercises,
                });
                finish();
              },
            },
          ],
        );
      })
      .catch(finish);
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * 주기 스냅샷 — 화면 상태를 그대로 기기에 남긴다.
   *
   * 매 입력마다 쓰면 타이핑 한 글자에 디스크 쓰기가 붙고, 저장을 안 하면 크래시에
   * 전부 날아간다. 10초 간격이면 최악의 손실이 10초다. 여기에 <b>백그라운드 진입 시
   * 즉시 쓰기</b>를 더한다 — OS 가 프로세스를 정리하는 건 거의 항상 그 직후다.
   */
  // 최신 종목 목록 — effect 클로저가 낡은 값을 붙잡지 않도록(TIP 배치 조회가 이걸 쓴다)
  const exercisesRef = useRef<SessionExercise[]>(exercises);
  exercisesRef.current = exercises;

  /** 서버 저장이 끝났는지 — 끝난 뒤에는 초안을 남기지도, 되살리지도 않는다 */
  const savedRef = useRef(false);

  const draftRef = useRef<SessionDraft | null>(null);
  draftRef.current = {
    savedAt: new Date().toISOString(),
    sessionDate: toDateString(),
    elapsedSec,
    restSeconds,
    routineId: routineCtx.routineId,
    routineTitle: routineCtx.routineTitle,
    originalExercises: routineCtx.original,
    exercises,
  };

  useEffect(() => {
    // 복구 여부를 정하기 전에 쓰면 초안을 되살리기도 전에 빈 세션으로 덮어쓴다
    if (!restoreChecked) return undefined;
    const snapshot = () => {
      // 이미 서버에 저장한 세션은 스냅샷하지 않는다 — 저장 후 루틴 동기화 안내가 떠 있는
      // 동안 다시 써버리면, 다음에 앱을 열 때 이미 기록된 세션이 되살아난다.
      const draft = savedRef.current ? null : draftRef.current;
      if (draft) void saveSessionDraft({ ...draft, savedAt: new Date().toISOString() });
    };
    const id = setInterval(snapshot, SNAPSHOT_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') snapshot();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [restoreChecked]);

  /*
   * 화면을 떠나면 초안을 지운다.
   *
   * <b>크래시는 언마운트가 아니다</b> — 그래서 이 정리는 "사용자가 스스로 나갔다"는
   * 뜻이고, 그때는 되살릴 게 없다(저장했거나, 이탈 가드에서 버리기로 한 것이다).
   * 복구 판정 전에는 정리를 걸지 않는다 — 개발 모드의 이중 마운트에서 초안을 되살리기도
   * 전에 지워버리기 때문이다.
   */
  useEffect(() => {
    if (!restoreChecked) return undefined;
    return () => {
      void clearSessionDraft();
    };
  }, [restoreChecked]);

  /*
   * 커플 음성 응원 — 애인이 녹음해둔 클립. 휴식 타이머는 setInterval 클로저 안에서
   * 재생을 트리거하는데, 그 클로저는 effect 가 만들어질 때(rest 가 0→양수로 바뀔 때)의
   * 값을 붙잡으므로 상태 대신 ref 로 최신값을 보장한다(바로 아래 restRef 와 같은 이유).
   */
  const partnerClipsRef = useRef<Partial<Record<VoicePhrase, string>>>({});
  useEffect(() => {
    voiceClipsApi
      .partner()
      .then((res) => {
        const byPhrase: Partial<Record<VoicePhrase, string>> = {};
        res.clips.forEach((c) => { byPhrase[c.phrase] = c.audioUrl; });
        partnerClipsRef.current = byPhrase;
        // 시작 응원은 화면에 들어오자마자 — "시작"이 가장 힘든 지점이라 여기서 튼다.
        // 클립을 받은 뒤에 재생해야 하므로 로드 콜백 안에 둔다.
        playVoiceClip(byPhrase.WORKOUT_START);
      })
      .catch(() => undefined);
  }, []);

  /*
   * 운동 부스터 — 애인이 보낸 일회성 응원. 있으면 세션 시작 때 한 번 재생하고 소멸시킨다.
   *
   * 재생한 <b>뒤에</b> 소비를 확정한다. 조회 시점에 소비하면 앱이 여기서 죽거나 네트워크가
   * 끊겼을 때 응원이 들리지도 않은 채 사라진다(서버 주석과 같은 이유).
   *
   * 상설 시작 응원(WORKOUT_START)과 겹치면 두 목소리가 동시에 난다 — 부스터가 우선이다
   * ("지금 이 순간을 위해" 보낸 것이라 상설 문구보다 맥락이 정확하다).
   */
  useEffect(() => {
    let cancelled = false;
    void voiceClipsApi
      .pendingBooster()
      .then((booster) => {
        if (cancelled || !booster) return;
        setBooster(booster);
        playVoiceClip(booster.audioUrl);
        return voiceClipsApi.markBoosterPlayed(booster.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // 운동 추가 모달
  const [addOpen, setAddOpen] = useState(false);
  const [fName, setFName] = useState('');
  const [fCategory, setFCategory] = useState('근력');
  const [fSets, setFSets] = useState('3');
  const [fReps, setFReps] = useState('10');
  const [fWeight, setFWeight] = useState('');
  const [adding, setAdding] = useState(false);

  // ② 역방향 루틴 저장 — 루틴 없이 시작한 자유 세션을 종료할 때 "새 루틴으로 저장?" 제안
  const [saveRoutinePromptOpen, setSaveRoutinePromptOpen] = useState(false);
  const [saveRoutineTitle, setSaveRoutineTitle] = useState('');
  const [savingRoutine, setSavingRoutine] = useState(false);

  // 대체 종목 바텀시트 — 루틴이 미리 지정해둔 추천 종목, 없으면(또는 다른 걸 원하면)
  // ExercisePickerModal 로 부위→기구를 좁혀가며 직접 찾는다
  const [substituteFor, setSubstituteFor] = useState<SessionExercise | null>(null);
  const [substitutePickerOpen, setSubstitutePickerOpen] = useState(false);

  // 대체 종목 탐색용 전체 카탈로그 — 종목 수가 적어(수십 개) 한 번만 받아 로컬에서 필터링한다
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  useEffect(() => {
    workoutApi.exerciseCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  const openSubstitute = (e: SessionExercise) => {
    haptics.light();
    setSubstituteFor(e);
  };
  const closeSubstituteSheet = () => {
    setSubstituteFor(null);
    setSubstitutePickerOpen(false);
  };

  /** 대체 종목 적용(공통) — 세트 구성(무게·횟수·완료 여부)은 그대로 두고 종목 정보만 바꾼다(데이터 손실 없음). */
  const applySubstituteCandidate = async (candidate: {
    name: string;
    category?: string | null;
    muscleGroup: string;
    equipment?: string | null;
    exerciseCatalogId: number;
    // 자극 부위 탐색(카탈로그 응답)에서는 바로 오지만, 루틴 사전 지정 대체 종목에는 아직 없다 —
    // 그 경우 undefined 로 넘어와 일단 TIP 카드를 비워두고(아래 배치 조회 effect가 채우진 않음,
    // ⇄ 로 한 번 더 바꾸거나 다음 세션부터 채워짐), 잘못된 이전 종목의 TIP이 남지 않게만 한다.
    description?: string | null;
    tip?: string | null;
    emoji?: string | null;
    breathingCue?: string | null;
  }) => {
    const targetKey = substituteFor?.key;
    if (!targetKey) return;
    setExercises((prev) =>
      prev.map((x) =>
        x.key === targetKey
          ? {
              ...x,
              name: candidate.name,
              category: candidate.category ?? x.category,
              muscleGroup: candidate.muscleGroup,
              equipment: candidate.equipment ?? undefined,
              exerciseCatalogId: candidate.exerciseCatalogId,
              description: candidate.description ?? undefined,
              tip: candidate.tip ?? undefined,
              emoji: candidate.emoji ?? undefined,
              breathingCue: candidate.breathingCue ?? undefined,
            }
          : x,
      ),
    );
    closeSubstituteSheet();
    haptics.success();
    toast.success(`${candidate.name}(으)로 교체했어요`);
    // 새 종목의 직전 기록이 있으면 아직 체크 안 한 세트만 이어서 프리필한다.
    try {
      const found = await workoutApi.lastPerformance([candidate.name]);
      if (found[0]) {
        setExercises((prev) =>
          prev.map((x) =>
            x.key === targetKey ? { ...x, sets: applyPrefill(x.sets, found[0], x.equipment, x.muscleGroup) } : x,
          ),
        );
      }
    } catch {
      // 프리필 실패는 무시 — 이미 종목 교체는 완료된 상태
    }
  };

  /** 자극 부위 탐색에서 고른 종목 교체 */
  const applySubstitute = (candidate: ExerciseCatalogItem) =>
    applySubstituteCandidate({
      name: candidate.name,
      category: candidate.category,
      muscleGroup: candidate.muscleGroup,
      equipment: candidate.equipment,
      exerciseCatalogId: candidate.id,
      description: candidate.description,
      tip: candidate.tip,
      emoji: candidate.emoji,
      breathingCue: candidate.breathingCue,
    });

  /** 루틴 작성 시 미리 지정해둔 대체 종목(④) 교체 — 탐색 없이 바로 적용 */
  const applyPresetAlternative = (alt: SessionExerciseAlternativeParam) =>
    applySubstituteCandidate({
      name: alt.name,
      category: alt.category,
      muscleGroup: alt.muscleGroup,
      equipment: alt.equipment,
      exerciseCatalogId: alt.exerciseCatalogId,
    });

  // 세션 시작 시 루틴/파라미터로 받은 종목들의 직전 기록을 한 번에 불러와 프리필한다.
  // 되살린 세션에는 하지 않는다 — 사용자가 이미 입력한 값을 지난주 기록으로 덮어쓰게 된다.
  useEffect(() => {
    if (!restoreChecked || restoredRef.current) return;
    const names = Array.from(new Set((route.params?.exercises ?? []).map((e) => e.name)));
    if (names.length === 0) return;
    workoutApi
      .lastPerformance(names)
      .then((list) => {
        if (list.length === 0) return;
        const byName = new Map(list.map((p) => [p.exerciseName, p]));
        setExercises((prev) =>
          prev.map((e) => {
            const perf = byName.get(e.name);
            return perf ? { ...e, sets: applyPrefill(e.sets, perf, e.equipment, e.muscleGroup) } : e;
          }),
        );
      })
      .catch(() => {
        // 프리필은 편의 기능이라 실패해도 조용히 넘어간다 — 직접 입력하면 된다.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreChecked]);

  // 세션 시작 시 종목들의 TIP(자세 큐)·이모지·호흡 타이밍을 이름으로 한 번에 배치 조회해 채운다.
  // 커스텀 종목(카탈로그에 없는 이름)은 응답에 안 잡히므로 자연히 TIP 카드가 안 뜬다.
  // (TIP 은 되살린 세션에도 다시 채운다 — 표시용이라 사용자 입력을 건드리지 않는다)
  useEffect(() => {
    if (!restoreChecked) return;
    const names = Array.from(new Set(exercisesRef.current.map((e) => e.name)));
    if (names.length === 0) return;
    workoutApi
      .exerciseCatalog(undefined, names)
      .then((list) => {
        if (list.length === 0) return;
        const byName = new Map(list.map((c) => [c.name, c]));
        setExercises((prev) =>
          prev.map((e) => {
            const c = byName.get(e.name);
            if (!c) return e;
            return {
              ...e,
              description: c.description ?? e.description,
              tip: c.tip ?? e.tip,
              emoji: c.emoji ?? e.emoji,
              breathingCue: c.breathingCue ?? e.breathingCue,
            };
          }),
        );
      })
      .catch(() => {
        // TIP 도 프리필처럼 편의 기능 — 실패해도 카드만 안 뜰 뿐 세션 진행엔 지장 없다.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 휴식 타이머 — rest>0 이면 1초씩 감소
  const restRef = useRef(rest);
  restRef.current = rest;
  useEffect(() => {
    if (rest <= 0) return;
    const id = setInterval(() => {
      const next = restRef.current - 1;
      if (next <= 0) {
        haptics.success();
        // 타이머가 다 돼서 자연스럽게 끝났을 때만 재생한다 — 건너뛰기/시간 조절 버튼으로
        // 직접 끝냈을 때는 안 튼다(haptics.success() 도 이 분기에서만 울리는 것과 같은 이유)
        playVoiceClip(partnerClipsRef.current.REST_END);
        setRest(0);
      } else {
        setRest(next);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [rest > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  // 총 볼륨(kg) — 완료된 세트만 합산(무게 × 횟수). 체크 전 세트는 아직 실제로 든 게 아니라 제외.
  const totalVolumeKg = exercises.reduce(
    (sum, e) =>
      sum +
      e.sets.reduce((s, set) => {
        if (!set.done) return s;
        return s + (toNum(set.weightKg) ?? 0) * (toNum(set.reps) ?? 0);
      }, 0),
    0,
  );

  const toggleSet = (exKey: string, idx: number) => {
    haptics.light();
    setExercises((prev) =>
      prev.map((e) => {
        if (e.key !== exKey) return e;
        const sets = e.sets.map((s, i) => (i === idx ? { ...s, done: !s.done } : s));
        // 방금 '완료'로 바꿨으면 휴식 타이머 시작 — 종목별 휴식 시간이 있으면 그걸, 없으면 전역 기본값(③)
        if (!e.sets[idx].done) {
          setRest(e.restSeconds ?? restSeconds);
          /*
           * 마지막 세트 응원 — 세션 전체에서 <b>한 세트만 남았을 때</b> 한 번.
           * 종목마다 울리면 잔소리가 되므로 전체 진행률로 판정하고, 같은 세션에서
           * 두 번 울리지 않게 ref 로 잠근다(세트를 껐다 켜면 다시 이 조건에 걸린다).
           */
          const remaining = prev.reduce((n, x) => n + x.sets.filter((z) => !z.done).length, 0) - 1;
          if (remaining === 1 && !lastSetCheeredRef.current) {
            lastSetCheeredRef.current = true;
            playVoiceClip(partnerClipsRef.current.LAST_SET);
          }
        }
        return { ...e, sets };
      }),
    );
  };

  /*
   * 타이핑 시점에 숫자만 남긴다 — decimal-pad 키보드로도 붙여넣기 등으로
   * "1.2.3"처럼 소수점이 여러 개인 값이 들어올 수 있고, 그러면 저장 시 toNum()이
   * undefined 를 돌려줘 사용자는 입력했다고 믿는데 값이 조용히 빠진다
   * (QA_CHECKLIST.md P0-1). 횟수는 소수 자체가 무의미해 정수만 허용한다.
   */
  const updateSetField = (exKey: string, idx: number, field: 'weightKg' | 'reps' | 'rpe', value: string) => {
    const sanitized = field === 'reps' ? sanitizeIntegerInput(value) : sanitizeDecimalInput(value);
    setExercises((prev) =>
      prev.map((e) => {
        if (e.key !== exKey) return e;
        const sets = e.sets.map((s, i) => (i === idx && !s.done ? { ...s, [field]: sanitized } : s));
        return { ...e, sets };
      }),
    );
  };

  const addSetRow = (exKey: string) =>
    setExercises((prev) =>
      prev.map((e) => {
        if (e.key !== exKey) return e;
        // 새 세트는 직전 세트 무게·횟수를 기본으로 이어받는다 — 매번 다시 입력할 필요 없게.
        // RPE는 세트마다 체감이 다른 주관적 값이라 이어받지 않고 비워둔다.
        const last = e.sets[e.sets.length - 1];
        return {
          ...e,
          sets: [...e.sets, { key: nextSetKey(), weightKg: last?.weightKg ?? '', reps: last?.reps ?? '', done: false, rpe: '' }],
        };
      }),
    );

  const removeExercise = (exKey: string) =>
    setExercises((prev) => prev.filter((e) => e.key !== exKey));

  const onAddExercise = async () => {
    if (!fName.trim()) {
      toast.error('운동 이름을 입력해주세요.');
      return;
    }
    const name = fName.trim();
    const setCount = Math.max(1, Math.min(20, Number(fSets) || 3));
    const targetReps = fReps ? Number(fReps) : undefined;
    const targetWeight = fWeight ? Number(fWeight) : undefined;

    setAdding(true);
    let sets = Array.from({ length: setCount }, () => buildSet(targetWeight, targetReps));
    try {
      const found = await workoutApi.lastPerformance([name]);
      if (found[0]) sets = applyPrefill(sets, found[0]);
    } catch {
      // 프리필 실패 시 방금 입력한 목표값만으로 진행
    }
    setExercises((prev) => [
      ...prev,
      { key: nextKey(), name, category: fCategory, reps: targetReps, weightKg: targetWeight, sets },
    ]);
    setFName('');
    setFWeight('');
    setAdding(false);
    setAddOpen(false);
  };

  const onFinish = async () => {
    const payloadSets = exercises
      .map((e, i) => {
        const doneList = e.sets.filter((s) => s.done);
        if (doneList.length === 0) return null;
        const last = doneList[doneList.length - 1];
        const repsVal = toNum(last.reps) ?? e.reps ?? null;
        const weightVal = toNum(last.weightKg) ?? e.weightKg ?? null;
        return {
          exerciseName: e.name,
          category: e.category,
          sets: doneList.length,
          reps: repsVal,
          weightKg: weightVal != null ? String(weightVal) : null,
          orderNo: i + 1,
          exerciseCatalogId: e.exerciseCatalogId ?? null,
          muscleGroup: e.muscleGroup ?? null,
          equipment: e.equipment ?? null,
          // 세트별 실제 입력값 — 프리필 그대로면 지난 기록과 같은 값, 수정했으면 그 값이 그대로 남는다.
          entries: e.sets.map((s, idx) => {
            const w = toNum(s.weightKg);
            const r = toNum(s.rpe);
            return {
              setNo: idx + 1,
              weightKg: w != null ? String(w) : null,
              reps: toNum(s.reps) ?? null,
              rpe: r != null ? String(r) : null,
              completed: s.done,
            };
          }),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (payloadSets.length === 0) {
      toast.error('완료한 세트가 없어요. 세트를 체크해주세요!');
      return;
    }

    const routineId = routineCtx.routineId;
    const composeChanged =
      routineId != null && hasCompositionChanged(routineCtx.original, exercises);

    setSaving(true);
    try {
      const saved = await save({
        workoutDate: toDateString(),
        // elapsedSec 는 화면 진입 시부터 재는 세션 경과 시간 — 저장 payload에 안 실으면
        // 운동 시간이 항상 빈 값으로 저장된다. 1분 미만은 0분이 아니라 최소 1분으로 올림.
        totalDurationMin: Math.max(1, Math.round(elapsedSec / 60)),
        sourceRoutineId: routineId,
        sets: payloadSets as never,
      });
      savedRef.current = true;
      void clearSessionDraft();
      haptics.success();
      toast.success('운동 완료! 기록했어요 ');
      // 커플 음성 응원 — PR 을 세웠으면 그 응원을, 아니면 완료 응원을 재생한다
      const isPrRun = !!saved.prs && saved.prs.length > 0;
      playVoiceClip(partnerClipsRef.current[isPrRun ? 'PR' : 'WORKOUT_COMPLETE']);
      // 이미 저장이 끝났으므로 이후의 모든 이탈(goBack)은 이탈 가드 확인 없이 통과시킨다
      allowLeave();
      if (routineId != null) {
        // 루틴에서 시작한 세션 — 구성이 바뀌었으면 템플릿에도 반영할지 물어본다(스마트 동기화)
        if (composeChanged) {
          promptRoutineSync(routineId, routineCtx.routineTitle ?? '내 루틴');
        } else {
          navigation.goBack();
        }
      } else {
        // ② 역방향 루틴 저장 — 자유 세션이면 다음에 원탭으로 시작할 수 있게 루틴화를 제안한다
        setSaveRoutineTitle(suggestRoutineTitle(exercises));
        setSaveRoutinePromptOpen(true);
      }
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  /*
   * 이탈 가드 — 예전엔 하단 "종료" 버튼에만 확인이 걸려 있어서
   * 헤더 뒤로가기·하드웨어 백·스와이프백으로 나가면 체크한 세트가 통째로 사라졌다.
   * usePreventRemove 기반 훅은 모든 이탈 경로를 가로챈다(goBack() 직접 호출도 포함).
   */
  const allowLeave = useDirtyGuard(doneSets > 0, {
    title: '세션 종료',
    message: '기록하지 않고 나갈까요?',
    stayText: '계속하기',
    leaveText: '나가기',
  });

  // 세트별 무게/횟수/RPE 입력이 하단 액션바("종료"/"운동 완료")를 키보드가 가리지 않게
  // (QA_CHECKLIST.md 패턴 4). 이 화면은 FlatList/DragList를 직접 자식으로 두는 화면이라
  // useAndroidKeyboardHeight의 실측 패딩 방식을 쓴다 — 자세한 이유는 그 훅의 문서 참고.
  const androidKeyboardHeight = useAndroidKeyboardHeight();

  // 운동 추가 모달 닫기 — 입력이 있으면 확인 후 닫는다 (백드롭·Android 백 공용).
  // "사라져요"라고 안내했으므로 닫을 때 실제로 비운다 (남기면 다음에 또 확인이 뜬다)
  const closeAddModal = () =>
    confirmDiscard(fName.trim().length > 0 || fWeight.trim().length > 0, () => {
      setAddOpen(false);
      setFName('');
      setFWeight('');
    });

  /** ② 방금 마친 자유 세션을 새 루틴 템플릿으로 저장 — 건너뛰어도 기록은 이미 저장된 상태. */
  const onSaveAsRoutine = async () => {
    if (!saveRoutineTitle.trim()) {
      toast.error('루틴 이름을 입력해주세요.');
      return;
    }
    setSavingRoutine(true);
    try {
      await workoutApi.saveRoutine({
        title: saveRoutineTitle.trim(),
        exercises: exercises.map((e) => ({
          exerciseName: e.name,
          category: e.category,
          targetSets: e.sets.length,
          reps: e.reps,
          weightKg: e.weightKg,
          exerciseCatalogId: e.exerciseCatalogId,
          muscleGroup: e.muscleGroup,
          equipment: e.equipment,
          restSeconds: e.restSeconds,
          alternativeExerciseCatalogIds: e.alternatives?.map((a) => a.exerciseCatalogId),
        })),
      });
      haptics.success();
      toast.success('새 루틴으로 저장했어요!');
    } catch (err) {
      toast.error(getErrorMessage(err, '루틴 저장에 실패했어요.'));
    } finally {
      setSavingRoutine(false);
      setSaveRoutinePromptOpen(false);
      navigation.goBack();
    }
  };

  const skipSaveAsRoutine = () => {
    setSaveRoutinePromptOpen(false);
    navigation.goBack();
  };

  /** 오늘 바뀐 구성(대체 종목·세트 추가/삭제)을 루틴 템플릿에도 반영할지 물어본다 —
   *  일회성 변경(이번만 적용)과 템플릿 업데이트(루틴에도 반영)를 한 번의 선택으로 나눈다. */
  const promptRoutineSync = (routineId: number, title: string) => {
    Alert.alert('루틴 구성이 바뀌었어요', '오늘 변경된 구성을 기존 루틴 템플릿에도 반영할까요?', [
      { text: '이번만 적용', style: 'cancel', onPress: () => navigation.goBack() },
      {
        text: '루틴에도 반영',
        onPress: async () => {
          try {
            await workoutApi.updateRoutine(routineId, {
              title,
              exercises: exercises.map((e) => ({
                exerciseName: e.name,
                category: e.category,
                targetSets: e.sets.length,
                reps: e.reps,
                weightKg: e.weightKg,
                exerciseCatalogId: e.exerciseCatalogId,
                muscleGroup: e.muscleGroup,
                equipment: e.equipment,
                restSeconds: e.restSeconds,
                alternativeExerciseCatalogIds: e.alternatives?.map((a) => a.exerciseCatalogId),
              })),
            });
            toast.success('루틴에도 반영했어요!');
          } catch (err) {
            toast.error(getErrorMessage(err, '루틴 반영에 실패했어요.'));
          } finally {
            navigation.goBack();
          }
        },
      },
    ]);
  };

  /** 종목 카드 — 네이티브(DragList)/웹(FlatList) 둘 다 이 렌더러를 공유한다.
   *  drag 가 undefined 면(웹) 손잡이를 눌러도 아무 일도 없다 — 순서 바꾸기는 네이티브 전용. */
  const renderExerciseCard = (
    e: SessionExercise,
    drag: (() => void) | undefined,
    isActive: boolean,
    dragEnd?: () => void,
  ) => {
    const done = e.sets.filter((s) => s.done).length;
    const e1rm = bestE1RM(e.sets);
    return (
      <View style={[styles.exCard, isActive && styles.exCardActive]}>
        <View style={styles.exHeader}>
          <Pressable
            onLongPress={drag}
            onPressOut={dragEnd}
            disabled={isActive || !drag}
            hitSlop={8}
            style={styles.dragHandle}
            accessibilityRole="button"
            accessibilityLabel="길게 눌러 순서 바꾸기"
          >
            <Text style={styles.dragHandleText}>⠿</Text>
          </Pressable>
          {/* 이 종목이 뭔지 한눈에 보여주는 그림 — 카탈로그에 있는 종목만(커스텀 종목은 안 뜬다) */}
          {e.emoji ? <Text style={styles.exEmoji}>{e.emoji}</Text> : null}
          <Text style={styles.exName}>{e.name}</Text>
          {/* 자극 부위 배지 — 몸 실루엣에 부위를 색칠. muscleGroup 만 있으면 되므로
              emoji/TIP 과 달리 커스텀 종목도(루틴에 부위가 저장돼 있으면) 뜬다 */}
          {e.muscleGroup ? <MuscleBodyBadge muscleGroup={e.muscleGroup} size={18} /> : null}
          <View style={styles.exHeaderActions}>
            <TouchableOpacity
              onPress={() => openSubstitute(e)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="대체 종목으로 바꾸기"
            >
              <Text style={styles.exSwap}>⇄</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => removeExercise(e.key)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="운동 삭제"
            >
              <Text style={styles.exRemove}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.exMeta}>
          {e.category}
          {e.muscleGroup ? ` · ${e.muscleGroup}` : ''} · {done}/{e.sets.length} 세트
          {/* e1RM(추정 1RM) — 완료한 세트가 있어야 계산 가능. 워밍업만 하고 본세트 전이면 아직 안 뜬다 */}
          {e1rm != null ? ` · e1RM ${formatWeight(e1rm)}` : ''}
        </Text>

        {/*
          동작 설명 — "이게 무슨 운동인지" 모르는 사람을 위한 줄. TIP(자세 교정 큐)은 이미 그
          운동을 아는 사람이 대상이라, 처음 보는 종목에서는 아무것도 알려주지 못했다.
          시범 이미지·영상은 저작권·용량 때문에 Non-goal 이라(PLAN.md), 더 보고 싶으면
          유튜브 검색으로 넘긴다 — PLAN.md 가 "외부 링크로 대체 가능"이라 명시한 경로다.
          TIP 과 별도 게이트다: 설명만 있고 tip 이 없는 종목도 설명은 보여야 한다.
        */}
        {e.description ? (
          <View style={styles.howToCard}>
            <Text style={styles.howToText}>{e.description}</Text>
            <TouchableOpacity
              onPress={() => openFormVideo(e.name)}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel={`${e.name} 동작 영상 검색`}
            >
              <Text style={styles.howToLink}>▶ 동작 영상 보기</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* TIP 카드 — 카탈로그에 있는 종목만(커스텀 종목/아직 못 불러왔으면 안 뜬다).
            호흡 타이밍(breathingCue)은 항상 자세 큐 아래 별도 줄로 붙는다. */}
        {e.tip ? (
          <View style={styles.tipCard}>
            <View style={styles.tipBadge}>
              <Text style={styles.tipBadgeText}>TIP</Text>
            </View>
            <View style={styles.tipTextCol}>
              <Text style={styles.tipText}>{e.tip}</Text>
              {e.breathingCue ? (
                <Text style={styles.breathingText}>🌬️ {e.breathingCue}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.setColHeader}>
          <Text style={styles.setColHeaderIndex} />
          <Text style={styles.setColHeaderText}>무게(kg)</Text>
          <Text style={styles.setColHeaderX} />
          <Text style={styles.setColHeaderText}>횟수</Text>
          <Text style={styles.setColHeaderRpe}>RPE</Text>
          <Text style={styles.setColHeaderCheck} />
        </View>
        <View style={styles.setRows}>
          {e.sets.map((s, i) => (
            // s.key 가 아니라 i 를 쓰면 중간 세트를 지울 때 뒤쪽 행들이 잘못된 위치로
            // 리마운트될 수 있다(QA_CHECKLIST.md 패턴 9). ?? i 는 이 필드가 생기기 전에
            // 저장된 로컬 초안(sessionDraft) 복구용 안전망일 뿐이다.
            <View key={s.key ?? i} style={styles.setRow}>
              <View style={styles.setRowIndexCol}>
                <Text style={styles.setRowIndex}>{i + 1}</Text>
                {/* 루틴에서 이 세트를 웜업으로 지정해뒀으면 배지로 표시 — 무게를 낮춰 가볍게
                    푸는 세트임을 실제 운동 중에도 한눈에 구분할 수 있게 */}
                {s.setType === 'WARMUP' ? (
                  <View style={styles.warmupBadge}>
                    <Text style={styles.warmupBadgeText}>웜업</Text>
                  </View>
                ) : null}
              </View>
              <TextInput
                style={[styles.setInput, s.done && styles.setInputDone]}
                value={s.weightKg}
                onChangeText={(v) => updateSetField(e.key, i, 'weightKg', v)}
                keyboardType="decimal-pad"
                placeholder="kg"
                placeholderTextColor={colors.textTertiary}
                editable={!s.done}
              />
              <Text style={styles.setRowX}>×</Text>
              <TextInput
                style={[styles.setInput, s.done && styles.setInputDone]}
                value={s.reps}
                onChangeText={(v) => updateSetField(e.key, i, 'reps', v)}
                keyboardType="number-pad"
                placeholder="회"
                placeholderTextColor={colors.textTertiary}
                editable={!s.done}
              />
              {/* RPE(자각 강도) — 직접 입력. 직전 기록이 있으면 프리필된다(applyPrefill).
                  무게·횟수와 마찬가지로 완료 체크 후에는 잠긴다(updateSetField가 done인
                  세트는 막는다) — 다시 고치려면 체크를 풀어야 한다. */}
              <TextInput
                style={[styles.setRpeInput, s.done && styles.setInputDone]}
                value={s.rpe}
                onChangeText={(v) => updateSetField(e.key, i, 'rpe', v)}
                keyboardType="decimal-pad"
                placeholder="-"
                placeholderTextColor={colors.textTertiary}
                editable={!s.done}
              />
              <TouchableOpacity
                style={[styles.setCheck, s.done && styles.setCheckDone]}
                onPress={() => toggleSet(e.key, i)}
                accessibilityRole="button"
                accessibilityLabel="세트 완료 체크"
                accessibilityState={{ selected: s.done }}
              >
                <Text style={[styles.setCheckText, s.done && styles.setCheckTextDone]}>
                  {s.done ? '✓' : ''}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.setAddRow} onPress={() => addSetRow(e.key)}>
            <Text style={styles.setAddText}>＋ 세트 추가</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  /** 목록 하단 — 종목 추가 버튼 + 안내 문구. 순서 바꾸기 힌트는 네이티브에만 보여준다
   *  (웹은 드래그 자체가 없으니 안내해봐야 헷갈리기만 한다). */
  const renderListFooter = (canReorder: boolean) => (
    <>
      <TouchableOpacity style={styles.addExercise} onPress={() => setAddOpen(true)}>
        <Text style={styles.addExerciseText}>＋ 운동 추가</Text>
      </TouchableOpacity>

      {exercises.length === 0 ? (
        <Text style={styles.emptyHint}>운동을 추가하면 직전 기록으로 무게·횟수가 채워져요.{'\n'}세트를 체크만 하면 자동으로 휴식 타이머가 돌아가요.</Text>
      ) : canReorder ? (
        <Text style={styles.reorderHint}>⠿ 을 길게 눌러 운동 순서를 바꿀 수 있어요.</Text>
      ) : null}
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/*
        부스터 배너 — 방금 재생된 응원이 누구 것인지 알려준다.
        소리만 나고 화면에 아무 표시가 없으면 "이게 뭐였지"로 끝난다.
        이미 소비된 뒤라 다시 듣기는 이 화면에 있는 동안만 가능하다.
      */}
      {booster ? (
        <Pressable style={styles.boosterBanner} onPress={() => playVoiceClip(booster.audioUrl)}>
          <Text style={styles.boosterBannerText} numberOfLines={2}>
            🎤 {booster.senderName}님의 부스터{booster.message ? ` — "${booster.message}"` : ''}
          </Text>
          <Text style={styles.boosterBannerHint}>다시 듣기</Text>
        </Pressable>
      ) : null}

      {/* 상단 요약바 — 운동 중 실시간으로 누적되는 경과 시간·총 볼륨·완료 세트 수 */}
      <View style={styles.summaryBar}>
        {/* 분만 보이면 첫 1분 내내 "0분"이라 안 가는 것처럼 보인다 — mm:ss 로 매초 눈에 띄게 */}
        <Text style={styles.summaryTime}>⏱ 운동 시간 {mmss(elapsedSec)}</Text>
        <View style={styles.summaryStats}>
          <View style={styles.summaryStatItem}>
            <Text style={styles.summaryStatValue}>
              {formatNumber(Math.round(totalVolumeKg))}
              <Text style={styles.summaryStatUnit}> kg</Text>
            </Text>
            <Text style={styles.summaryStatLabel}>총 볼륨</Text>
          </View>
          <View style={styles.summaryStatDivider} />
          <View style={styles.summaryStatItem}>
            <Text style={styles.summaryStatValue}>
              {doneSets}
              <Text style={styles.summaryStatUnit}> 세트</Text>
            </Text>
            <Text style={styles.summaryStatLabel}>완료</Text>
          </View>
        </View>
      </View>

      {/* 진행 헤더 */}
      <View style={styles.progressBar}>
        <Text style={styles.progressText}>
          세트 {doneSets}/{totalSets}
        </Text>
        <View style={styles.restPresets}>
          <Text style={styles.restLabel}>휴식</Text>
          {REST_PRESETS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.restChip, restSeconds === r && styles.restChipActive]}
              onPress={() => setRestSeconds(r)}
              accessibilityState={{ selected: restSeconds === r }}
            >
              <Text style={[styles.restChipText, restSeconds === r && styles.restChipTextActive]}>{r}s</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <KeyboardAvoidingView
        style={[styles.flex, Platform.OS === 'android' && { paddingBottom: androidKeyboardHeight }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      {Platform.OS === 'web' ? (
        // 웹은 터치 드래그 제스처 전제인 순서 바꾸기가 원래도 아쉬운 기능이라, 평범한
        // FlatList로 스크롤만 살리고 순서 바꾸기는 뺀다(네이티브는 DragList로 그대로 유지).
        <FlatList
          style={styles.listContainer}
          data={exercises}
          keyExtractor={(e) => e.key}
          contentContainerStyle={styles.list}
          renderItem={({ item: e }) => renderExerciseCard(e, undefined, false)}
          ListFooterComponent={renderListFooter(false)}
        />
      ) : (
        // react-native-draglist — react-native-reanimated/gesture-handler에 의존하지 않고
        // PanResponder만으로 동작한다. 예전에 쓰던 react-native-draggable-flatlist는
        // Reanimated 4(New Architecture 전용 메이저 버전)와 호환되지 않아 카드가 렌더링되지
        // 않는 조용한 버그를 냈다(docs/QA_RUN_2026-08-25.md 참고) — 이 라이브러리로 교체해
        // 그 버전 호환성 문제 자체를 없앤다.
        <DragList
          // containerStyle이 실제로 감싸는 바깥 View에 적용되고, style은 그 안쪽 FlatList에
          // 적용된다(react-native-draglist 내부 구조). flex:1을 style에만 주면 바깥 View가
          // 높이 0으로 접혀 목록 전체가 안 보인다 — 반드시 containerStyle에 줘야 한다.
          containerStyle={styles.listContainer}
          data={exercises}
          keyExtractor={(e) => e.key}
          onReordered={(fromIndex, toIndex) => {
            setExercises((prev) => {
              const next = [...prev];
              const [moved] = next.splice(fromIndex, 1);
              next.splice(toIndex, 0, moved);
              return next;
            });
          }}
          contentContainerStyle={styles.list}
          renderItem={({ item: e, onDragStart, onDragEnd, isActive }: DragListRenderItemInfo<SessionExercise>) =>
            renderExerciseCard(e, onDragStart, isActive, onDragEnd)
          }
          ListFooterComponent={renderListFooter(true)}
        />
      )}

      {/* 하단 액션 — 휴식 타이머는 이 영역 위에 오버레이로 뜬다 (레이아웃을 밀지 않음) */}
      <View style={styles.bottomArea}>
        {rest > 0 ? (
          <View style={styles.timerOverlay}>
            <Text style={styles.timerText}>휴식 {mmss(rest)}</Text>
            <View style={styles.timerBtns}>
              <TouchableOpacity
                style={styles.timerBtn}
                onPress={() => setRest((r) => Math.max(0, r - 15))}
                accessibilityRole="button"
                accessibilityLabel="휴식 15초 줄이기"
              >
                <Text style={styles.timerBtnText}>-15</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.timerBtn}
                onPress={() => setRest((r) => r + 15)}
                accessibilityRole="button"
                accessibilityLabel="휴식 15초 늘리기"
              >
                <Text style={styles.timerBtnText}>+15</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.timerBtn, styles.timerSkip]} onPress={() => setRest(0)}>
                <Text style={styles.timerSkipText}>건너뛰기</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* 하단 액션 — 세트를 체크했으면 useDirtyGuard 가 확인 다이얼로그를 띄운다 */}
        <View style={styles.footer}>
          <Button title="종료" variant="ghost" size="md" onPress={() => navigation.goBack()} style={styles.flex} />
          <Button title="운동 완료" size="md" onPress={onFinish} loading={saving} style={styles.flex} />
        </View>
      </View>
      </KeyboardAvoidingView>

      {/* 운동 추가 모달 */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAddModal}>
        <Pressable style={styles.backdrop} onPress={closeAddModal}>
          {/* 키보드가 모달 하단 버튼을 가리지 않도록 카드째로 밀어올린다 */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>운동 추가</Text>
              <TextField label="운동 이름" placeholder="예: 벤치프레스" value={fName} onChangeText={setFName} />
              <Text style={styles.modalLabel}>부위</Text>
              <View style={styles.catRow}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.catChip, fCategory === c && styles.catChipActive]}
                    onPress={() => setFCategory(c)}
                    accessibilityState={{ selected: fCategory === c }}
                  >
                    <Text style={[styles.catText, fCategory === c && styles.catTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.formRow}>
                <View style={styles.flex}>
                  <TextField
                    label="세트"
                    value={fSets}
                    onChangeText={(v) => setFSets(sanitizeIntegerInput(v))}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.flex}>
                  <TextField
                    label="횟수"
                    value={fReps}
                    onChangeText={(v) => setFReps(sanitizeIntegerInput(v))}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.flex}>
                  <TextField
                    label="무게(kg)"
                    value={fWeight}
                    onChangeText={(v) => setFWeight(sanitizeDecimalInput(v))}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <Button title="추가" onPress={onAddExercise} loading={adding} style={styles.modalBtn} />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* 대체 종목 선택 — 루틴이 미리 지정해둔 추천 종목 + 부위·기구로 직접 찾기 */}
      <Modal
        visible={!!substituteFor}
        transparent
        animationType="fade"
        onRequestClose={() => closeSubstituteSheet()}
      >
        <Pressable style={styles.backdrop} onPress={() => closeSubstituteSheet()}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>대체 종목 선택</Text>
            <Text style={styles.modalLabel}>
              {substituteFor?.name} 대신 다른 운동으로 바꿔요 · 세트 기록은 그대로 유지돼요
            </Text>
            {substituteFor?.alternatives && substituteFor.alternatives.length > 0 ? (
              <>
                <Text style={styles.modalLabel}>⭐ 추천 대체 종목</Text>
                <View style={styles.groupRow}>
                  {substituteFor.alternatives.map((a) => (
                    <TouchableOpacity
                      key={a.exerciseCatalogId}
                      style={styles.presetChip}
                      onPress={() => applyPresetAlternative(a)}
                    >
                      <Text style={styles.presetChipText}>{a.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
            <TouchableOpacity style={styles.findSubstituteBtn} onPress={() => setSubstitutePickerOpen(true)}>
              <Text style={styles.findSubstituteBtnText}>🔍 부위·기구로 다른 종목 찾기</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ExercisePickerModal
        visible={substitutePickerOpen}
        catalog={catalog}
        excludeName={substituteFor?.name}
        onClose={() => setSubstitutePickerOpen(false)}
        onSelect={(item) => {
          applySubstitute(item);
          setSubstitutePickerOpen(false);
        }}
      />

      {/* ② 역방향 루틴 저장 — 자유 세션 종료 시 다음에 원탭으로 시작할 수 있게 루틴화 제안 */}
      <Modal
        visible={saveRoutinePromptOpen}
        transparent
        animationType="fade"
        onRequestClose={skipSaveAsRoutine}
      >
        <Pressable style={styles.backdrop} onPress={skipSaveAsRoutine}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>이 기록을 새 루틴으로 저장할까요?</Text>
            <Text style={styles.modalLabel}>다음엔 원탭으로 오늘처럼 시작할 수 있어요</Text>
            <TextField
              label="루틴 이름"
              value={saveRoutineTitle}
              onChangeText={setSaveRoutineTitle}
              placeholder="예: 오늘 한 운동"
            />
            <View style={styles.formRow}>
              <Button title="건너뛰기" variant="ghost" onPress={skipSaveAsRoutine} style={styles.flex} />
              <Button
                title="루틴으로 저장"
                onPress={onSaveAsRoutine}
                loading={savingRoutine}
                style={styles.flex}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  summaryBar: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  summaryTime: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.caption,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  boosterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.togetherBg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  boosterBannerText: { flex: 1, fontSize: fontSize.caption, color: colors.togetherText, fontWeight: '700' },
  boosterBannerHint: { fontSize: fontSize.caption, color: colors.together, fontWeight: '800' },
  summaryStats: { flexDirection: 'row', alignItems: 'center' },
  summaryStatItem: { marginRight: spacing.lg },
  summaryStatValue: { color: colors.white, fontSize: fontSize.title, fontWeight: '800' },
  summaryStatUnit: { fontSize: fontSize.body, fontWeight: '700' },
  summaryStatLabel: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.caption, marginTop: 2 },
  summaryStatDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: 'rgba(255,255,255,0.25)', marginRight: spacing.lg },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  progressText: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  restPresets: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  restLabel: { fontSize: fontSize.caption, color: colors.textSecondary, marginRight: 2 },
  restChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  restChipText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  restChipTextActive: { color: colors.primary },
  // FlatList/DragList 자체(=style)에 flex 가 없으면 종목이 몇 개만 늘어나도
  // 목록이 화면 높이를 넘는데 자기 안에서 스크롤 영역을 못 잡아, 목록 맨 아래(운동 추가
  // 버튼)가 하단 액션바 뒤로 밀려 잘린다. contentContainerStyle(list)과는 별개로 필요하다.
  listContainer: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  exCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  exCardActive: { borderColor: colors.primary, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dragHandle: { paddingRight: spacing.xs, paddingVertical: 2 },
  dragHandleText: { fontSize: fontSize.subtitle, color: colors.textMuted, fontWeight: '800' },
  // 종목 그림(이모지) — 이름 앞에 살짝 크게 둬서 무슨 운동인지 한눈에 들어오게 한다
  exEmoji: { fontSize: fontSize.subtitle },
  exName: { flex: 1, fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  exHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  exSwap: { fontSize: fontSize.body, color: colors.primary, fontWeight: '800' },
  exRemove: { fontSize: fontSize.body, color: colors.textMuted, fontWeight: '700' },
  exMeta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  // 동작 설명 — TIP 카드 바로 위. TIP(회색 보조 카드)보다 먼저 읽혀야 하는 정보라
  // 배경 없이 본문 톤으로 두고, 영상 링크만 primary 색으로 눈에 띄게 한다.
  howToCard: { gap: 4, marginTop: spacing.sm },
  howToText: { fontSize: fontSize.caption, color: colors.textPrimary, lineHeight: 19 },
  howToLink: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  tipBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryBg,
  },
  tipBadgeText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  tipTextCol: { flex: 1, gap: 2 },
  tipText: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  // 호흡 타이밍 — 자세 큐와 구분되게 살짝 옅은 색으로, 항상 TIP 카드 안에 같이 붙는다
  breathingText: { fontSize: fontSize.caption, color: colors.textTertiary, lineHeight: 18 },
  setColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  setColHeaderIndex: { width: 34 },
  setColHeaderText: { flex: 1, fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center' },
  setColHeaderX: { width: 12 },
  setColHeaderRpe: { width: 40, fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center' },
  setColHeaderCheck: { width: 40 },
  setRows: { gap: spacing.xs, marginTop: spacing.xs },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // 인덱스 숫자 + (있으면) 웜업 배지를 세로로 쌓는 칼럼 — 헤더의 setColHeaderIndex 와 너비를 맞춘다
  setRowIndexCol: { width: 34, alignItems: 'center', gap: 2 },
  setRowIndex: { textAlign: 'center', fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  warmupBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  warmupBadgeText: { fontSize: 9, fontWeight: '700', color: colors.textMuted },
  setInput: {
    flex: 1,
    /*
     * 웹(react-native-web) 필수 — <input> 은 내재 최소 폭(~180px)이 있고 CSS 의
     * flex 아이템 기본값(min-width: auto)은 그 이하로 줄지 못하게 막는다.
     * 그래서 flex:1 인데도 무게·횟수 입력 둘이 화면보다 넓어져 RPE·완료 체크가
     * 화면 밖으로 밀려났다(헤더 행은 Text 라 줄어들어서 헤더만 제자리인 증상).
     * 네이티브(yoga)는 원래 0 까지 줄어들므로 영향이 없다.
     */
    minWidth: 0,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    textAlign: 'center',
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  setInputDone: { backgroundColor: colors.surface, color: colors.textSecondary },
  setRowX: { width: 12, textAlign: 'center', fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700' },
  // 무게·횟수 입력(setInput)과 같은 패턴이지만 flex:1이 아니라 고정 너비 — "1~10" 두 자리면 충분해서
  setRpeInput: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    textAlign: 'center',
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  setCheck: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  setCheckDone: { backgroundColor: colors.success, borderColor: colors.success },
  setCheckText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textSecondary },
  setCheckTextDone: { color: colors.white },
  setAddRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  setAddText: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700' },
  addExercise: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  addExerciseText: { fontSize: fontSize.body, fontWeight: '800', color: colors.primary },
  emptyHint: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg, lineHeight: 20 },
  reorderHint: { fontSize: fontSize.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm },
  // 하단 영역 — 타이머는 이 영역을 기준으로 절대 위치 오버레이된다 (footer 를 밀지 않는다)
  bottomArea: { position: 'relative' },
  timerOverlay: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  timerText: { color: colors.white, fontSize: fontSize.subtitle, fontWeight: '800' },
  timerBtns: { flexDirection: 'row', gap: spacing.sm },
  timerBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  timerBtnText: { color: colors.white, fontWeight: '800', fontSize: fontSize.caption },
  timerSkip: { backgroundColor: colors.white },
  timerSkipText: { color: colors.primaryDark, fontWeight: '800', fontSize: fontSize.caption },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  modalLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.xs },
  catRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  catChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  catText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  catTextActive: { color: colors.primary },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: { marginTop: spacing.sm },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  presetChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  presetChipText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  findSubstituteBtn: {
    marginTop: spacing.sm,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findSubstituteBtnText: { fontSize: fontSize.body, color: colors.primary, fontWeight: '700' },
}));
