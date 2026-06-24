import {
  AiRoutineContext,
  AiRoutinePlan,
  isOpenAiConfigured,
  requestOpenAiRoutine,
} from './openaiRoutineProvider';
import {
  ExerciseCandidate,
  GeneratedDay,
  RoutineProfile,
  generateRoutinePlan,
} from './routineGenerator';

export type RoutineGenerationResult = {
  days: GeneratedDay[];
  source: 'ai' | 'rules';
  model?: string;
  fallbackReason?: 'not_configured' | 'provider_error' | 'invalid_output';
};

type AiProvider = typeof requestOpenAiRoutine;

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

export function validateAiRoutinePlan(
  plan: AiRoutinePlan,
  profile: RoutineProfile,
  exercises: ExerciseCandidate[]
): GeneratedDay[] | null {
  if (!plan || !Array.isArray(plan.days) || plan.days.length !== profile.daysPerWeek) return null;

  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const exerciseLimit = profile.sessionDurationMin <= 45 ? 4 : profile.sessionDurationMin <= 75 ? 5 : 6;
  const dayNumbers = new Set<number>();
  const validatedDays: GeneratedDay[] = [];

  for (const day of plan.days) {
    if (!isIntegerInRange(day.dayNumber, 1, profile.daysPerWeek) || dayNumbers.has(day.dayNumber)) return null;
    if (typeof day.name !== 'string' || !day.name.trim() || day.name.length > 80) return null;
    if (!Array.isArray(day.focus) || day.focus.length < 1 || day.focus.some((focus) => typeof focus !== 'string')) return null;
    if (!Array.isArray(day.exercises) || day.exercises.length < 1 || day.exercises.length > exerciseLimit) return null;

    const usedExercises = new Set<string>();
    const validatedExercises: GeneratedDay['exercises'] = [];
    for (const [index, item] of day.exercises.entries()) {
      const exercise = exerciseById.get(item.exerciseId);
      if (!exercise || usedExercises.has(item.exerciseId)) return null;
      if (!isIntegerInRange(item.sets, 1, 6)) return null;
      if (!isIntegerInRange(item.repMin, 1, 30) || !isIntegerInRange(item.repMax, item.repMin, 30)) return null;
      if (!isIntegerInRange(item.targetRir, 0, 5)) return null;
      if (!isIntegerInRange(item.restSeconds, 30, 300)) return null;

      usedExercises.add(item.exerciseId);
      validatedExercises.push({
        exercise,
        order: index + 1,
        sets: item.sets,
        repMin: item.repMin,
        repMax: item.repMax,
        targetRir: item.targetRir,
        restSeconds: item.restSeconds,
      });
    }

    dayNumbers.add(day.dayNumber);
    validatedDays.push({
      dayNumber: day.dayNumber,
      name: day.name.trim(),
      focus: day.focus.map((focus) => focus.trim()).filter(Boolean),
      exercises: validatedExercises,
    });
  }

  return validatedDays.sort((a, b) => a.dayNumber - b.dayNumber);
}

export async function generateRoutineWithFallback(
  profile: RoutineProfile,
  exercises: ExerciseCandidate[],
  context: AiRoutineContext,
  provider: AiProvider = requestOpenAiRoutine
): Promise<RoutineGenerationResult> {
  if (!isOpenAiConfigured() && provider === requestOpenAiRoutine) {
    return {
      days: generateRoutinePlan(profile, exercises),
      source: 'rules',
      fallbackReason: 'not_configured',
    };
  }

  try {
    const response = await provider(profile, context, exercises);
    const days = validateAiRoutinePlan(response.plan, profile, exercises);
    if (!days) {
      return {
        days: generateRoutinePlan(profile, exercises),
        source: 'rules',
        fallbackReason: 'invalid_output',
      };
    }

    return { days, source: 'ai', model: response.model };
  } catch (error) {
    console.warn('AI routine generation failed; using rules fallback:', error instanceof Error ? error.message : 'Unknown error');
    return {
      days: generateRoutinePlan(profile, exercises),
      source: 'rules',
      fallbackReason: 'provider_error',
    };
  }
}
