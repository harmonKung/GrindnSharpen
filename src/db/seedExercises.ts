import pool, { getClient } from './database';

type ExerciseSeed = {
  name: string;
  slug: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string[];
  movementPattern: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
};

const exercises: ExerciseSeed[] = [
  { name: 'Barbell Back Squat', slug: 'barbell-back-squat', primaryMuscle: 'quads', secondaryMuscles: ['glutes', 'hamstrings'], equipment: ['gym_full', 'gym_basic', 'home_barbell'], movementPattern: 'squat', difficulty: 'intermediate' },
  { name: 'Leg Press', slug: 'leg-press', primaryMuscle: 'quads', secondaryMuscles: ['glutes'], equipment: ['gym_full', 'gym_basic'], movementPattern: 'squat', difficulty: 'beginner' },
  { name: 'Bulgarian Split Squat', slug: 'bulgarian-split-squat', primaryMuscle: 'quads', secondaryMuscles: ['glutes', 'hamstrings'], equipment: ['gym_full', 'gym_basic', 'home_dumbbells', 'home_barbell', 'bodyweight_only'], movementPattern: 'lunge', difficulty: 'intermediate' },
  { name: 'Bodyweight Squat', slug: 'bodyweight-squat', primaryMuscle: 'quads', secondaryMuscles: ['glutes'], equipment: ['gym_full', 'gym_basic', 'home_dumbbells', 'home_barbell', 'resistance_bands', 'bodyweight_only'], movementPattern: 'squat', difficulty: 'beginner' },
  { name: 'Romanian Deadlift', slug: 'romanian-deadlift', primaryMuscle: 'hamstrings', secondaryMuscles: ['glutes', 'back'], equipment: ['gym_full', 'gym_basic', 'home_dumbbells', 'home_barbell'], movementPattern: 'hinge', difficulty: 'intermediate' },
  { name: 'Seated Leg Curl', slug: 'seated-leg-curl', primaryMuscle: 'hamstrings', secondaryMuscles: [], equipment: ['gym_full', 'gym_basic'], movementPattern: 'knee-flexion', difficulty: 'beginner' },
  { name: 'Glute Bridge', slug: 'glute-bridge', primaryMuscle: 'glutes', secondaryMuscles: ['hamstrings'], equipment: ['gym_full', 'gym_basic', 'home_dumbbells', 'home_barbell', 'resistance_bands', 'bodyweight_only'], movementPattern: 'hinge', difficulty: 'beginner' },
  { name: 'Standing Calf Raise', slug: 'standing-calf-raise', primaryMuscle: 'calves', secondaryMuscles: [], equipment: ['gym_full', 'gym_basic', 'home_dumbbells', 'home_barbell', 'bodyweight_only'], movementPattern: 'calf-raise', difficulty: 'beginner' },
  { name: 'Barbell Bench Press', slug: 'barbell-bench-press', primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders'], equipment: ['gym_full', 'gym_basic', 'home_barbell'], movementPattern: 'horizontal-push', difficulty: 'intermediate' },
  { name: 'Incline Dumbbell Press', slug: 'incline-dumbbell-press', primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'triceps'], equipment: ['gym_full', 'gym_basic', 'home_dumbbells'], movementPattern: 'horizontal-push', difficulty: 'beginner' },
  { name: 'Push-Up', slug: 'push-up', primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders'], equipment: ['gym_full', 'gym_basic', 'home_dumbbells', 'home_barbell', 'resistance_bands', 'bodyweight_only'], movementPattern: 'horizontal-push', difficulty: 'beginner' },
  { name: 'Overhead Press', slug: 'overhead-press', primaryMuscle: 'shoulders', secondaryMuscles: ['triceps'], equipment: ['gym_full', 'gym_basic', 'home_dumbbells', 'home_barbell'], movementPattern: 'vertical-push', difficulty: 'intermediate' },
  { name: 'Pike Push-Up', slug: 'pike-push-up', primaryMuscle: 'shoulders', secondaryMuscles: ['triceps'], equipment: ['gym_full', 'gym_basic', 'home_dumbbells', 'home_barbell', 'bodyweight_only'], movementPattern: 'vertical-push', difficulty: 'intermediate' },
  { name: 'Dumbbell Lateral Raise', slug: 'dumbbell-lateral-raise', primaryMuscle: 'shoulders', secondaryMuscles: [], equipment: ['gym_full', 'gym_basic', 'home_dumbbells'], movementPattern: 'shoulder-abduction', difficulty: 'beginner' },
  { name: 'Lat Pulldown', slug: 'lat-pulldown', primaryMuscle: 'back', secondaryMuscles: ['biceps'], equipment: ['gym_full', 'gym_basic', 'cable_machine'], movementPattern: 'vertical-pull', difficulty: 'beginner' },
  { name: 'Pull-Up', slug: 'pull-up', primaryMuscle: 'back', secondaryMuscles: ['biceps'], equipment: ['gym_full', 'gym_basic', 'pull_up_bar', 'bodyweight_only'], movementPattern: 'vertical-pull', difficulty: 'intermediate' },
  { name: 'One-Arm Dumbbell Row', slug: 'one-arm-dumbbell-row', primaryMuscle: 'back', secondaryMuscles: ['biceps'], equipment: ['gym_full', 'gym_basic', 'home_dumbbells'], movementPattern: 'horizontal-pull', difficulty: 'beginner' },
  { name: 'Barbell Row', slug: 'barbell-row', primaryMuscle: 'back', secondaryMuscles: ['biceps', 'hamstrings'], equipment: ['gym_full', 'gym_basic', 'home_barbell'], movementPattern: 'horizontal-pull', difficulty: 'intermediate' },
  { name: 'Resistance Band Row', slug: 'resistance-band-row', primaryMuscle: 'back', secondaryMuscles: ['biceps'], equipment: ['resistance_bands'], movementPattern: 'horizontal-pull', difficulty: 'beginner' },
  { name: 'Dumbbell Biceps Curl', slug: 'dumbbell-biceps-curl', primaryMuscle: 'biceps', secondaryMuscles: [], equipment: ['gym_full', 'gym_basic', 'home_dumbbells'], movementPattern: 'elbow-flexion', difficulty: 'beginner' },
  { name: 'Resistance Band Curl', slug: 'resistance-band-curl', primaryMuscle: 'biceps', secondaryMuscles: [], equipment: ['resistance_bands'], movementPattern: 'elbow-flexion', difficulty: 'beginner' },
  { name: 'Cable Triceps Pushdown', slug: 'cable-triceps-pushdown', primaryMuscle: 'triceps', secondaryMuscles: [], equipment: ['gym_full', 'gym_basic', 'cable_machine'], movementPattern: 'elbow-extension', difficulty: 'beginner' },
  { name: 'Close-Grip Push-Up', slug: 'close-grip-push-up', primaryMuscle: 'triceps', secondaryMuscles: ['chest', 'shoulders'], equipment: ['gym_full', 'gym_basic', 'home_dumbbells', 'home_barbell', 'resistance_bands', 'bodyweight_only'], movementPattern: 'horizontal-push', difficulty: 'beginner' },
  { name: 'Plank', slug: 'plank', primaryMuscle: 'core', secondaryMuscles: [], equipment: ['gym_full', 'gym_basic', 'home_dumbbells', 'home_barbell', 'resistance_bands', 'bodyweight_only'], movementPattern: 'core-stability', difficulty: 'beginner' }
];

async function seedExercises() {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    for (const exercise of exercises) {
      await client.query(
        `INSERT INTO exercises (
          name, slug, primary_muscle, secondary_muscles,
          equipment, movement_pattern, difficulty
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          primary_muscle = EXCLUDED.primary_muscle,
          secondary_muscles = EXCLUDED.secondary_muscles,
          equipment = EXCLUDED.equipment,
          movement_pattern = EXCLUDED.movement_pattern,
          difficulty = EXCLUDED.difficulty,
          is_active = TRUE`,
        [
          exercise.name,
          exercise.slug,
          exercise.primaryMuscle,
          exercise.secondaryMuscles,
          exercise.equipment,
          exercise.movementPattern,
          exercise.difficulty,
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded ${exercises.length} exercises`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Exercise seed failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seedExercises();
