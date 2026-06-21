export type ExerciseCandidate = {
  id: string;
  name: string;
  slug: string;
  primary_muscle: string;
  secondary_muscles: string[];
  movement_pattern: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
};

export type RoutineProfile = {
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  primaryGoal: string;
  daysPerWeek: number;
  sessionDurationMin: number;
};

export type GeneratedDay = {
  dayNumber: number;
  name: string;
  focus: string[];
  exercises: Array<{
    exercise: ExerciseCandidate;
    order: number;
    sets: number;
    repMin: number;
    repMax: number;
    targetRir: number;
    restSeconds: number;
  }>;
};

type DayTemplate = { name: string; focus: string[] };

const splits: Record<number, DayTemplate[]> = {
  1: [{ name: 'Full Body', focus: ['quads', 'chest', 'back', 'hamstrings', 'shoulders', 'core'] }],
  2: [
    { name: 'Full Body A', focus: ['quads', 'chest', 'back', 'shoulders', 'core'] },
    { name: 'Full Body B', focus: ['hamstrings', 'back', 'chest', 'glutes', 'arms'] },
  ],
  3: [
    { name: 'Push', focus: ['chest', 'shoulders', 'triceps'] },
    { name: 'Pull', focus: ['back', 'biceps', 'hamstrings'] },
    { name: 'Legs', focus: ['quads', 'hamstrings', 'glutes', 'calves', 'core'] },
  ],
  4: [
    { name: 'Upper A', focus: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
    { name: 'Lower A', focus: ['quads', 'hamstrings', 'glutes', 'calves', 'core'] },
    { name: 'Upper B', focus: ['back', 'chest', 'shoulders', 'triceps', 'biceps'] },
    { name: 'Lower B', focus: ['hamstrings', 'quads', 'glutes', 'calves', 'core'] },
  ],
  5: [
    { name: 'Push', focus: ['chest', 'shoulders', 'triceps'] },
    { name: 'Pull', focus: ['back', 'biceps', 'hamstrings'] },
    { name: 'Legs', focus: ['quads', 'hamstrings', 'glutes', 'calves', 'core'] },
    { name: 'Upper', focus: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
    { name: 'Lower', focus: ['quads', 'hamstrings', 'glutes', 'calves', 'core'] },
  ],
  6: [
    { name: 'Push A', focus: ['chest', 'shoulders', 'triceps'] },
    { name: 'Pull A', focus: ['back', 'biceps', 'hamstrings'] },
    { name: 'Legs A', focus: ['quads', 'hamstrings', 'glutes', 'calves', 'core'] },
    { name: 'Push B', focus: ['shoulders', 'chest', 'triceps'] },
    { name: 'Pull B', focus: ['back', 'biceps', 'hamstrings'] },
    { name: 'Legs B', focus: ['hamstrings', 'quads', 'glutes', 'calves', 'core'] },
  ],
  7: [
    { name: 'Push', focus: ['chest', 'shoulders', 'triceps'] },
    { name: 'Pull', focus: ['back', 'biceps'] },
    { name: 'Legs', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
    { name: 'Upper', focus: ['chest', 'back', 'shoulders'] },
    { name: 'Lower', focus: ['quads', 'hamstrings', 'glutes', 'core'] },
    { name: 'Arms and Shoulders', focus: ['shoulders', 'biceps', 'triceps'] },
    { name: 'Full Body', focus: ['quads', 'chest', 'back', 'hamstrings', 'core'] },
  ],
};

const difficultyRank = { beginner: 1, intermediate: 2, advanced: 3 };

function getPrescription(profile: RoutineProfile, movementPattern: string | null) {
  const isolationPatterns = new Set([
    'elbow-flexion', 'elbow-extension', 'shoulder-abduction',
    'calf-raise', 'core-stability', 'knee-flexion',
  ]);
  const isIsolation = movementPattern ? isolationPatterns.has(movementPattern) : false;

  if (profile.primaryGoal === 'strength') {
    return {
      sets: profile.experienceLevel === 'beginner' ? 3 : 4,
      repMin: isIsolation ? 8 : 4,
      repMax: isIsolation ? 12 : 6,
      targetRir: 2,
      restSeconds: isIsolation ? 90 : 180,
    };
  }

  if (profile.primaryGoal === 'endurance') {
    return { sets: 3, repMin: 12, repMax: 15, targetRir: 3, restSeconds: 60 };
  }

  return {
    sets: profile.experienceLevel === 'beginner' ? 3 : 4,
    repMin: isIsolation ? 10 : 8,
    repMax: isIsolation ? 15 : 12,
    targetRir: profile.experienceLevel === 'beginner' ? 3 : 2,
    restSeconds: isIsolation ? 60 : 90,
  };
}

function matchesFocus(exercise: ExerciseCandidate, focus: string) {
  if (focus === 'arms') {
    return exercise.primary_muscle === 'biceps' || exercise.primary_muscle === 'triceps';
  }
  return exercise.primary_muscle === focus;
}

export function generateRoutinePlan(profile: RoutineProfile, exercises: ExerciseCandidate[]): GeneratedDay[] {
  const templates = splits[profile.daysPerWeek] || splits[4];
  const exercisesPerDay = profile.sessionDurationMin <= 45 ? 4 : profile.sessionDurationMin <= 75 ? 5 : 6;
  const usage = new Map<string, number>();
  const maxDifficulty = difficultyRank[profile.experienceLevel];

  return templates.map((template, dayIndex) => {
    const selected: ExerciseCandidate[] = [];
    let attempts = 0;

    while (selected.length < exercisesPerDay && attempts < template.focus.length * 3) {
      const focus = template.focus[attempts % template.focus.length];
      const unused = exercises.filter((exercise) => !selected.some((item) => item.id === exercise.id));
      const suitable = unused.filter((exercise) =>
        matchesFocus(exercise, focus) && difficultyRank[exercise.difficulty] <= maxDifficulty
      );
      const fallback = unused.filter((exercise) => matchesFocus(exercise, focus));
      const candidates = suitable.length > 0 ? suitable : fallback;
      const choice = candidates.sort((a, b) => (usage.get(a.id) || 0) - (usage.get(b.id) || 0))[0];

      if (choice) {
        selected.push(choice);
        usage.set(choice.id, (usage.get(choice.id) || 0) + 1);
      }
      attempts++;
    }

    if (selected.length < exercisesPerDay) {
      const fillers = exercises
        .filter((exercise) => !selected.some((item) => item.id === exercise.id))
        .sort((a, b) => (usage.get(a.id) || 0) - (usage.get(b.id) || 0));
      selected.push(...fillers.slice(0, exercisesPerDay - selected.length));
    }

    return {
      dayNumber: dayIndex + 1,
      name: template.name,
      focus: template.focus,
      exercises: selected.map((exercise, exerciseIndex) => ({
        exercise,
        order: exerciseIndex + 1,
        ...getPrescription(profile, exercise.movement_pattern),
      })),
    };
  });
}
