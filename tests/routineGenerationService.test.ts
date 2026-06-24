import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiRoutinePlan } from '../src/services/openaiRoutineProvider';
import {
  generateRoutineWithFallback,
  validateAiRoutinePlan,
} from '../src/services/routineGenerationService';
import { ExerciseCandidate, RoutineProfile } from '../src/services/routineGenerator';

const profile: RoutineProfile = {
  experienceLevel: 'beginner',
  primaryGoal: 'build_muscle',
  daysPerWeek: 2,
  sessionDurationMin: 45,
};

const context = {
  equipment: ['gym_full'],
  limitations: null,
  physiqueArchetype: 'lean_aesthetic',
};

const exercises: ExerciseCandidate[] = [
  {
    id: '1958117f-e589-42d6-855c-3219158f6aff',
    name: 'Squat',
    slug: 'squat',
    primary_muscle: 'quads',
    secondary_muscles: ['glutes'],
    movement_pattern: 'squat',
    difficulty: 'beginner',
  },
  {
    id: '2958117f-e589-42d6-855c-3219158f6aff',
    name: 'Bench Press',
    slug: 'bench-press',
    primary_muscle: 'chest',
    secondary_muscles: ['triceps'],
    movement_pattern: 'horizontal-push',
    difficulty: 'beginner',
  },
  {
    id: '3958117f-e589-42d6-855c-3219158f6aff',
    name: 'Lat Pulldown',
    slug: 'lat-pulldown',
    primary_muscle: 'back',
    secondary_muscles: ['biceps'],
    movement_pattern: 'vertical-pull',
    difficulty: 'beginner',
  },
  {
    id: '4958117f-e589-42d6-855c-3219158f6aff',
    name: 'Romanian Deadlift',
    slug: 'romanian-deadlift',
    primary_muscle: 'hamstrings',
    secondary_muscles: ['glutes'],
    movement_pattern: 'hinge',
    difficulty: 'beginner',
  },
];

const validPlan: AiRoutinePlan = {
  days: [
    {
      dayNumber: 1,
      name: 'Full Body A',
      focus: ['quads', 'chest'],
      exercises: [
        { exerciseId: exercises[0].id, sets: 3, repMin: 8, repMax: 12, targetRir: 3, restSeconds: 90 },
        { exerciseId: exercises[1].id, sets: 3, repMin: 8, repMax: 12, targetRir: 3, restSeconds: 90 },
      ],
    },
    {
      dayNumber: 2,
      name: 'Full Body B',
      focus: ['back', 'hamstrings'],
      exercises: [
        { exerciseId: exercises[2].id, sets: 3, repMin: 10, repMax: 12, targetRir: 3, restSeconds: 90 },
        { exerciseId: exercises[3].id, sets: 3, repMin: 8, repMax: 12, targetRir: 3, restSeconds: 120 },
      ],
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AI routine generation orchestration', () => {
  it('accepts and maps a valid plan from the provider', async () => {
    const provider = vi.fn().mockResolvedValue({ plan: validPlan, model: 'test-model' });

    const result = await generateRoutineWithFallback(profile, exercises, context, provider);

    expect(result.source).toBe('ai');
    expect(result.model).toBe('test-model');
    expect(result.days).toHaveLength(2);
    expect(result.days[0].exercises[0]).toMatchObject({
      exercise: exercises[0],
      order: 1,
      sets: 3,
      repMin: 8,
      repMax: 12,
    });
  });

  it('rejects a plan containing an exercise outside the supplied catalog', async () => {
    const invalidPlan = structuredClone(validPlan);
    invalidPlan.days[0].exercises[0].exerciseId = '9958117f-e589-42d6-855c-3219158f6aff';
    const provider = vi.fn().mockResolvedValue({ plan: invalidPlan, model: 'test-model' });

    const result = await generateRoutineWithFallback(profile, exercises, context, provider);

    expect(result.source).toBe('rules');
    expect(result.fallbackReason).toBe('invalid_output');
    expect(result.days).toHaveLength(2);
  });

  it('rejects invalid prescription ranges', () => {
    const invalidPlan = structuredClone(validPlan);
    invalidPlan.days[0].exercises[0].repMin = 15;
    invalidPlan.days[0].exercises[0].repMax = 8;

    expect(validateAiRoutinePlan(invalidPlan, profile, exercises)).toBeNull();
  });

  it('falls back when the provider fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const provider = vi.fn().mockRejectedValue(new Error('Provider unavailable'));

    const result = await generateRoutineWithFallback(profile, exercises, context, provider);

    expect(result.source).toBe('rules');
    expect(result.fallbackReason).toBe('provider_error');
    expect(result.days).toHaveLength(2);
  });

  it('uses rules without making a request when OpenAI is not configured', async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const result = await generateRoutineWithFallback(profile, exercises, context);
      expect(result.source).toBe('rules');
      expect(result.fallbackReason).toBe('not_configured');
    } finally {
      if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    }
  });
});
