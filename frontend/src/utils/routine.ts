/** 루틴 → 세션 시작 파라미터 변환 — "루틴 탭 = 그 루틴으로 세션 시작"은 어느 화면에서든
 * 같은 동작이어야 해서, 화면마다 흩어져 있던 동일 로직을 한 곳으로 모았다. */
import type { WorkoutRoutine } from '../types';
import type { WorkoutStackParamList } from '../navigation/types';

export function routineToSessionParams(
  routine: WorkoutRoutine,
): WorkoutStackParamList['WorkoutSession'] {
  return {
    routineId: routine.id,
    routineTitle: routine.title,
    exercises: routine.exercises.map((e) => ({
      name: e.exerciseName,
      category: e.category ?? undefined,
      targetSets: e.targetSets ?? undefined,
      reps: e.reps ?? undefined,
      weightKg: e.weightKg ?? undefined,
      muscleGroup: e.muscleGroup ?? undefined,
      equipment: e.equipment ?? undefined,
      exerciseCatalogId: e.exerciseCatalogId ?? undefined,
      restSeconds: e.restSeconds ?? undefined,
      sets: e.sets?.map((s) => ({
        reps: s.reps ?? undefined,
        weightKg: s.weightKg ?? undefined,
        setType: s.setType ?? undefined,
      })),
      alternatives: e.alternatives?.map((a) => ({
        exerciseCatalogId: a.exerciseCatalogId,
        name: a.name,
        muscleGroup: a.muscleGroup,
        equipment: a.equipment ?? undefined,
      })),
    })),
  };
}
