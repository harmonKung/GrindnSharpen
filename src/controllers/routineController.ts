import { Response } from 'express';
import { getClient, query } from '../db/database';
import { AuthRequest } from '../middleware/auth';
import { ExerciseCandidate, generateRoutinePlan } from '../services/routineGenerator';

const goalNames: Record<string, string> = {
  build_muscle: 'Muscle Building',
  lose_fat: 'Fat Loss',
  recomp: 'Body Recomposition',
  strength: 'Strength',
  endurance: 'Muscular Endurance',
  general_fitness: 'General Fitness',
};

export const generateRoutine = async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await getClient();
  let transactionStarted = false;

  try {
    const profileResult = await client.query(
      `SELECT experience_level, primary_goal, days_per_week,
              session_duration_min, equipment, limitations, physique_archetype
       FROM user_profiles WHERE user_id = $1`,
      [req.user!.userId]
    );
    const profile = profileResult.rows[0];

    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const equipment = profile.equipment?.length ? profile.equipment : ['gym_full'];
    const exerciseResult = await client.query(
      `SELECT id, name, slug, primary_muscle, secondary_muscles,
              movement_pattern, difficulty
       FROM exercises
       WHERE is_active = TRUE AND equipment && $1::text[]
       ORDER BY primary_muscle, name`,
      [equipment]
    );

    if (exerciseResult.rows.length === 0) {
      res.status(422).json({ error: 'No exercises match this profile equipment' });
      return;
    }

    const generatorProfile = {
      experienceLevel: profile.experience_level,
      primaryGoal: profile.primary_goal,
      daysPerWeek: profile.days_per_week,
      sessionDurationMin: profile.session_duration_min,
    };
    const days = generateRoutinePlan(generatorProfile, exerciseResult.rows as ExerciseCandidate[]);
    const name = `${profile.days_per_week}-Day ${goalNames[profile.primary_goal] || 'Training'} Routine`;

    await client.query('BEGIN');
    transactionStarted = true;
    const routineResult = await client.query(
      `INSERT INTO routines (
        user_id, name, goal, experience_level, days_per_week,
        session_duration_min, generation_source, generation_context
      ) VALUES ($1, $2, $3, $4, $5, $6, 'rules', $7)
      RETURNING id, name, goal, experience_level, days_per_week,
                session_duration_min, status, generation_source, created_at`,
      [
        req.user!.userId,
        name,
        profile.primary_goal,
        profile.experience_level,
        profile.days_per_week,
        profile.session_duration_min,
        JSON.stringify({
          equipment,
          limitations: profile.limitations,
          physiqueArchetype: profile.physique_archetype,
        }),
      ]
    );
    const routine = routineResult.rows[0];
    const savedDays = [];

    for (const day of days) {
      const dayResult = await client.query(
        `INSERT INTO routine_days (routine_id, day_number, name, focus)
         VALUES ($1, $2, $3, $4)
         RETURNING id, day_number, name, focus`,
        [routine.id, day.dayNumber, day.name, day.focus]
      );
      const savedDay = dayResult.rows[0];

      for (const item of day.exercises) {
        await client.query(
          `INSERT INTO routine_exercises (
            routine_day_id, exercise_id, exercise_order, sets,
            rep_min, rep_max, target_rir, rest_seconds
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [savedDay.id, item.exercise.id, item.order, item.sets,
            item.repMin, item.repMax, item.targetRir, item.restSeconds]
        );
      }

      savedDays.push({
        id: savedDay.id,
        dayNumber: savedDay.day_number,
        name: savedDay.name,
        focus: savedDay.focus,
        exercises: day.exercises.map((item) => ({
          id: item.exercise.id,
          name: item.exercise.name,
          primaryMuscle: item.exercise.primary_muscle,
          order: item.order,
          sets: item.sets,
          repMin: item.repMin,
          repMax: item.repMax,
          targetRir: item.targetRir,
          restSeconds: item.restSeconds,
        })),
      });
    }

    await client.query('COMMIT');
    transactionStarted = false;
    res.status(201).json({
      routine: {
        id: routine.id,
        name: routine.name,
        goal: routine.goal,
        experienceLevel: routine.experience_level,
        daysPerWeek: routine.days_per_week,
        sessionDurationMin: routine.session_duration_min,
        status: routine.status,
        generationSource: routine.generation_source,
        createdAt: routine.created_at,
        days: savedDays,
      },
    });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
    console.error('Generate routine error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const listRoutines = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT r.id, r.name, r.goal, r.experience_level, r.days_per_week,
              r.session_duration_min, r.status, r.generation_source,
              r.created_at, COUNT(rd.id)::int AS day_count
       FROM routines r
       LEFT JOIN routine_days rd ON rd.routine_id = r.id
       WHERE r.user_id = $1
       GROUP BY r.id
       ORDER BY r.created_at DESC`,
      [req.user!.userId]
    );

    res.json({ routines: result.rows.map((routine) => ({
      id: routine.id,
      name: routine.name,
      goal: routine.goal,
      experienceLevel: routine.experience_level,
      daysPerWeek: routine.days_per_week,
      sessionDurationMin: routine.session_duration_min,
      status: routine.status,
      generationSource: routine.generation_source,
      dayCount: routine.day_count,
      createdAt: routine.created_at,
    })) });
  } catch (error) {
    console.error('List routines error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRoutine = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const routineResult = await query(
      `SELECT id, name, goal, experience_level, days_per_week,
              session_duration_min, status, generation_source, created_at
       FROM routines WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.userId]
    );
    const routine = routineResult.rows[0];

    if (!routine) {
      res.status(404).json({ error: 'Routine not found' });
      return;
    }

    const detailResult = await query(
      `SELECT rd.id AS day_id, rd.day_number, rd.name AS day_name, rd.focus,
              re.exercise_order, re.sets, re.rep_min, re.rep_max,
              re.target_rir, re.rest_seconds, re.tempo, re.notes,
              e.id AS exercise_id, e.name AS exercise_name,
              e.primary_muscle, e.secondary_muscles
       FROM routine_days rd
       LEFT JOIN routine_exercises re ON re.routine_day_id = rd.id
       LEFT JOIN exercises e ON e.id = re.exercise_id
       WHERE rd.routine_id = $1
       ORDER BY rd.day_number, re.exercise_order`,
      [routine.id]
    );

    type RoutineDayResponse = {
      id: string;
      dayNumber: number;
      name: string;
      focus: string[];
      exercises: Record<string, unknown>[];
    };
    const days = new Map<string, RoutineDayResponse>();

    for (const row of detailResult.rows) {
      if (!days.has(row.day_id)) {
        days.set(row.day_id, {
          id: row.day_id,
          dayNumber: row.day_number,
          name: row.day_name,
          focus: row.focus,
          exercises: [],
        });
      }

      if (row.exercise_id) {
        days.get(row.day_id)!.exercises.push({
          id: row.exercise_id,
          name: row.exercise_name,
          primaryMuscle: row.primary_muscle,
          secondaryMuscles: row.secondary_muscles,
          order: row.exercise_order,
          sets: row.sets,
          repMin: row.rep_min,
          repMax: row.rep_max,
          targetRir: row.target_rir,
          restSeconds: row.rest_seconds,
          tempo: row.tempo,
          notes: row.notes,
        });
      }
    }

    res.json({ routine: {
      id: routine.id,
      name: routine.name,
      goal: routine.goal,
      experienceLevel: routine.experience_level,
      daysPerWeek: routine.days_per_week,
      sessionDurationMin: routine.session_duration_min,
      status: routine.status,
      generationSource: routine.generation_source,
      createdAt: routine.created_at,
      days: Array.from(days.values()),
    } });
  } catch (error) {
    console.error('Get routine error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
