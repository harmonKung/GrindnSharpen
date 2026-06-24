import OpenAI from 'openai';
import { ExerciseCandidate, RoutineProfile } from './routineGenerator';

export type AiRoutineContext = {
  equipment: string[];
  limitations: string | null;
  physiqueArchetype: string | null;
};

export type AiRoutinePlan = {
  days: Array<{
    dayNumber: number;
    name: string;
    focus: string[];
    exercises: Array<{
      exerciseId: string;
      sets: number;
      repMin: number;
      repMax: number;
      targetRir: number;
      restSeconds: number;
    }>;
  }>;
};

export function isOpenAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function requestOpenAiRoutine(
  profile: RoutineProfile,
  context: AiRoutineContext,
  exercises: ExerciseCandidate[]
): Promise<{ plan: AiRoutinePlan; model: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI is not configured');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
  const exerciseLimit = profile.sessionDurationMin <= 45 ? 4 : profile.sessionDurationMin <= 75 ? 5 : 6;
  const exerciseIds = exercises.map((exercise) => exercise.id);
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 1,
    timeout: 15_000,
  });

  const response = await client.responses.create({
    model,
    instructions: [
      'You design conservative bodybuilding routines.',
      'Use only exercise IDs from the supplied catalog.',
      'Respect the user schedule, experience, equipment, limitations, and session duration.',
      'Limitations are user context, not a medical diagnosis. Avoid movements that clearly conflict with them.',
      'Balance weekly muscle coverage and avoid duplicate exercises within a day.',
      'Return only the requested structured result.',
    ].join(' '),
    input: JSON.stringify({
      profile,
      context,
      exerciseCatalog: exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        primaryMuscle: exercise.primary_muscle,
        secondaryMuscles: exercise.secondary_muscles,
        movementPattern: exercise.movement_pattern,
        difficulty: exercise.difficulty,
      })),
    }),
    text: {
      format: {
        type: 'json_schema',
        name: 'bodybuilding_routine',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['days'],
          properties: {
            days: {
              type: 'array',
              minItems: profile.daysPerWeek,
              maxItems: profile.daysPerWeek,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['dayNumber', 'name', 'focus', 'exercises'],
                properties: {
                  dayNumber: { type: 'integer', minimum: 1, maximum: profile.daysPerWeek },
                  name: { type: 'string', minLength: 1, maxLength: 80 },
                  focus: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 8,
                    items: { type: 'string', minLength: 1, maxLength: 40 },
                  },
                  exercises: {
                    type: 'array',
                    minItems: 1,
                    maxItems: exerciseLimit,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['exerciseId', 'sets', 'repMin', 'repMax', 'targetRir', 'restSeconds'],
                      properties: {
                        exerciseId: { type: 'string', enum: exerciseIds },
                        sets: { type: 'integer', minimum: 1, maximum: 6 },
                        repMin: { type: 'integer', minimum: 1, maximum: 30 },
                        repMax: { type: 'integer', minimum: 1, maximum: 30 },
                        targetRir: { type: 'integer', minimum: 0, maximum: 5 },
                        restSeconds: { type: 'integer', minimum: 30, maximum: 300 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!response.output_text) {
    throw new Error('OpenAI returned an empty routine');
  }

  return {
    plan: JSON.parse(response.output_text) as AiRoutinePlan,
    model,
  };
}
