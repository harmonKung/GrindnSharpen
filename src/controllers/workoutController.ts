import { Response } from 'express';
import { validationResult } from 'express-validator';
import { getClient, query } from '../db/database';
import { AuthRequest } from '../middleware/auth';
import { buildProgressionRecommendation, PerformanceSet } from '../services/progressionService';

type WorkoutExerciseResponse = {
  id: string;
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  order: number;
  prescribedSets: number | null;
  prescribedRepMin: number | null;
  prescribedRepMax: number | null;
  targetRir: number | null;
  restSeconds: number | null;
  notes: string | null;
  sets: Record<string, unknown>[];
  previousPerformance: {
    workoutId: string;
    completedAt: string;
    sets: PerformanceSet[];
  } | null;
  recommendation: ReturnType<typeof buildProgressionRecommendation>;
};

async function getWorkoutDetails(userId: string, workoutId: string) {
  const workoutResult = await query(
    `SELECT ws.id, ws.routine_id, ws.routine_day_id, ws.name, ws.status,
            ws.started_at, ws.completed_at, ws.notes,
            r.name AS routine_name, rd.day_number
     FROM workout_sessions ws
     LEFT JOIN routines r ON r.id = ws.routine_id
     LEFT JOIN routine_days rd ON rd.id = ws.routine_day_id
     WHERE ws.id = $1 AND ws.user_id = $2`,
    [workoutId, userId]
  );
  const workout = workoutResult.rows[0];
  if (!workout) return null;

  const detailResult = await query(
    `SELECT wse.id AS session_exercise_id, wse.exercise_id,
            wse.exercise_order, wse.prescribed_sets,
            wse.prescribed_rep_min, wse.prescribed_rep_max,
            wse.target_rir, wse.rest_seconds, wse.notes AS exercise_notes,
            e.name AS exercise_name, e.primary_muscle,
            ls.id AS set_id, ls.set_number, ls.set_type, ls.weight_kg,
            ls.reps, ls.rir, ls.rpe, ls.is_completed,
            ls.completed_at, ls.notes AS set_notes
     FROM workout_session_exercises wse
     JOIN exercises e ON e.id = wse.exercise_id
     LEFT JOIN logged_sets ls ON ls.workout_session_exercise_id = wse.id
     WHERE wse.workout_session_id = $1
     ORDER BY wse.exercise_order, ls.set_type, ls.set_number`,
    [workout.id]
  );

  const previousResult = await query(
    `WITH current_exercises AS (
       SELECT DISTINCT exercise_id
       FROM workout_session_exercises
       WHERE workout_session_id = $1
     ), previous_exercises AS (
       SELECT DISTINCT ON (wse.exercise_id)
              wse.id AS session_exercise_id, wse.exercise_id,
              ws.id AS workout_id, ws.completed_at
       FROM workout_session_exercises wse
       JOIN workout_sessions ws ON ws.id = wse.workout_session_id
       JOIN current_exercises ce ON ce.exercise_id = wse.exercise_id
       WHERE ws.user_id = $2 AND ws.status = 'completed' AND ws.id <> $1
         AND EXISTS (
           SELECT 1 FROM logged_sets previous_set
           WHERE previous_set.workout_session_exercise_id = wse.id
             AND previous_set.is_completed = TRUE
             AND previous_set.set_type = 'working'
         )
       ORDER BY wse.exercise_id, ws.completed_at DESC
     )
     SELECT pe.exercise_id, pe.workout_id, pe.completed_at,
            ls.set_number, ls.weight_kg, ls.reps, ls.rir
     FROM previous_exercises pe
     JOIN logged_sets ls ON ls.workout_session_exercise_id = pe.session_exercise_id
     WHERE ls.is_completed = TRUE AND ls.set_type = 'working'
     ORDER BY pe.exercise_id, ls.set_number`,
    [workout.id, userId]
  );

  const previousByExercise = new Map<string, {
    workoutId: string;
    completedAt: string;
    sets: PerformanceSet[];
  }>();

  for (const row of previousResult.rows) {
    if (!previousByExercise.has(row.exercise_id)) {
      previousByExercise.set(row.exercise_id, {
        workoutId: row.workout_id,
        completedAt: row.completed_at,
        sets: [],
      });
    }
    previousByExercise.get(row.exercise_id)!.sets.push({
      setNumber: row.set_number,
      weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
      reps: row.reps,
      rir: row.rir,
    });
  }

  const exercises = new Map<string, WorkoutExerciseResponse>();
  for (const row of detailResult.rows) {
    if (!exercises.has(row.session_exercise_id)) {
      const previousPerformance = previousByExercise.get(row.exercise_id) ?? null;
      exercises.set(row.session_exercise_id, {
        id: row.session_exercise_id,
        exerciseId: row.exercise_id,
        name: row.exercise_name,
        primaryMuscle: row.primary_muscle,
        order: row.exercise_order,
        prescribedSets: row.prescribed_sets,
        prescribedRepMin: row.prescribed_rep_min,
        prescribedRepMax: row.prescribed_rep_max,
        targetRir: row.target_rir,
        restSeconds: row.rest_seconds,
        notes: row.exercise_notes,
        sets: [],
        previousPerformance,
        recommendation: buildProgressionRecommendation(previousPerformance?.sets ?? [], {
          repMin: row.prescribed_rep_min,
          repMax: row.prescribed_rep_max,
          targetRir: row.target_rir,
          primaryMuscle: row.primary_muscle,
        }),
      });
    }

    if (row.set_id) {
      exercises.get(row.session_exercise_id)!.sets.push({
        id: row.set_id,
        setNumber: row.set_number,
        setType: row.set_type,
        weightKg: row.weight_kg,
        reps: row.reps,
        rir: row.rir,
        rpe: row.rpe,
        isCompleted: row.is_completed,
        completedAt: row.completed_at,
        notes: row.set_notes,
      });
    }
  }

  return {
    id: workout.id,
    routineId: workout.routine_id,
    routineDayId: workout.routine_day_id,
    routineName: workout.routine_name,
    dayNumber: workout.day_number,
    name: workout.name,
    status: workout.status,
    startedAt: workout.started_at,
    completedAt: workout.completed_at,
    notes: workout.notes,
    exercises: Array.from(exercises.values()),
  };
}

function hasValidationErrors(req: AuthRequest, res: Response) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;

  res.status(400).json({ errors: errors.array() });
  return true;
}

export const startWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  const client = await getClient();
  let transactionStarted = false;

  try {
    const { routineDayId } = req.body;
    const activeResult = await client.query(
      `SELECT id FROM workout_sessions
       WHERE user_id = $1 AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1`,
      [req.user!.userId]
    );

    if (activeResult.rows[0]) {
      res.status(409).json({
        error: 'An active workout already exists',
        workoutId: activeResult.rows[0].id,
      });
      return;
    }

    const dayResult = await client.query(
      `SELECT rd.id, rd.name, rd.day_number, r.id AS routine_id, r.name AS routine_name
       FROM routine_days rd
       JOIN routines r ON r.id = rd.routine_id
       WHERE rd.id = $1 AND r.user_id = $2`,
      [routineDayId, req.user!.userId]
    );
    const day = dayResult.rows[0];

    if (!day) {
      res.status(404).json({ error: 'Routine day not found' });
      return;
    }

    const prescribedResult = await client.query(
      `SELECT re.id, re.exercise_id, re.exercise_order, re.sets,
              re.rep_min, re.rep_max, re.target_rir,
              re.rest_seconds, re.notes
       FROM routine_exercises re
       WHERE re.routine_day_id = $1
       ORDER BY re.exercise_order`,
      [day.id]
    );

    if (prescribedResult.rows.length === 0) {
      res.status(422).json({ error: 'Routine day has no exercises' });
      return;
    }

    await client.query('BEGIN');
    transactionStarted = true;
    const workoutResult = await client.query(
      `INSERT INTO workout_sessions (
        user_id, routine_id, routine_day_id, name
      ) VALUES ($1, $2, $3, $4)
      RETURNING id`,
      [req.user!.userId, day.routine_id, day.id, day.name]
    );
    const workoutId = workoutResult.rows[0].id;

    for (const exercise of prescribedResult.rows) {
      await client.query(
        `INSERT INTO workout_session_exercises (
          workout_session_id, exercise_id, routine_exercise_id,
          exercise_order, prescribed_sets, prescribed_rep_min,
          prescribed_rep_max, target_rir, rest_seconds, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          workoutId,
          exercise.exercise_id,
          exercise.id,
          exercise.exercise_order,
          exercise.sets,
          exercise.rep_min,
          exercise.rep_max,
          exercise.target_rir,
          exercise.rest_seconds,
          exercise.notes,
        ]
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;
    const workout = await getWorkoutDetails(req.user!.userId, workoutId);
    res.status(201).json({ workout });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
    console.error('Start workout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const getWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const workout = await getWorkoutDetails(req.user!.userId, req.params.id);
    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }
    res.json({ workout });
  } catch (error) {
    console.error('Get workout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listWorkoutHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT ws.id, ws.name, ws.status, ws.started_at, ws.completed_at,
              ws.routine_id, ws.routine_day_id,
              COUNT(DISTINCT wse.id)::int AS exercise_count,
              COUNT(ls.id) FILTER (WHERE ls.is_completed = TRUE)::int AS completed_set_count,
              COALESCE(SUM(ls.weight_kg * ls.reps)
                FILTER (WHERE ls.is_completed = TRUE), 0) AS total_volume_kg
       FROM workout_sessions ws
       LEFT JOIN workout_session_exercises wse ON wse.workout_session_id = ws.id
       LEFT JOIN logged_sets ls ON ls.workout_session_exercise_id = wse.id
       WHERE ws.user_id = $1
       GROUP BY ws.id
       ORDER BY ws.started_at DESC`,
      [req.user!.userId]
    );

    res.json({ workouts: result.rows.map((workout) => ({
      id: workout.id,
      name: workout.name,
      status: workout.status,
      routineId: workout.routine_id,
      routineDayId: workout.routine_day_id,
      startedAt: workout.started_at,
      completedAt: workout.completed_at,
      exerciseCount: workout.exercise_count,
      completedSetCount: workout.completed_set_count,
      totalVolumeKg: workout.total_volume_kg,
    })) });
  } catch (error) {
    console.error('List workout history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const upsertLoggedSet = async (req: AuthRequest, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const {
      sessionExerciseId, setNumber, setType = 'working',
      weightKg, reps, rir, rpe, isCompleted = true, notes,
    } = req.body;
    const ownershipResult = await query(
      `SELECT wse.id
       FROM workout_session_exercises wse
       JOIN workout_sessions ws ON ws.id = wse.workout_session_id
       WHERE wse.id = $1 AND ws.id = $2 AND ws.user_id = $3
         AND ws.status = 'in_progress'`,
      [sessionExerciseId, req.params.id, req.user!.userId]
    );

    if (!ownershipResult.rows[0]) {
      res.status(404).json({ error: 'Active workout exercise not found' });
      return;
    }

    const result = await query(
      `INSERT INTO logged_sets (
        workout_session_exercise_id, set_number, set_type,
        weight_kg, reps, rir, rpe, is_completed, completed_at, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                CASE WHEN $8 THEN NOW() ELSE NULL END, $9)
      ON CONFLICT (workout_session_exercise_id, set_type, set_number)
      DO UPDATE SET
        weight_kg = EXCLUDED.weight_kg,
        reps = EXCLUDED.reps,
        rir = EXCLUDED.rir,
        rpe = EXCLUDED.rpe,
        is_completed = EXCLUDED.is_completed,
        completed_at = EXCLUDED.completed_at,
        notes = EXCLUDED.notes
      RETURNING *`,
      [sessionExerciseId, setNumber, setType, weightKg, reps, rir, rpe, isCompleted, notes]
    );
    const set = result.rows[0];

    res.status(201).json({ set: {
      id: set.id,
      sessionExerciseId: set.workout_session_exercise_id,
      setNumber: set.set_number,
      setType: set.set_type,
      weightKg: set.weight_kg,
      reps: set.reps,
      rir: set.rir,
      rpe: set.rpe,
      isCompleted: set.is_completed,
      completedAt: set.completed_at,
      notes: set.notes,
    } });
  } catch (error) {
    console.error('Log set error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateLoggedSet = async (req: AuthRequest, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const { weightKg, reps, rir, rpe, isCompleted, notes } = req.body;
    const result = await query(
      `UPDATE logged_sets ls SET
        weight_kg = COALESCE($1, ls.weight_kg),
        reps = COALESCE($2, ls.reps),
        rir = COALESCE($3, ls.rir),
        rpe = COALESCE($4, ls.rpe),
        is_completed = COALESCE($5, ls.is_completed),
        completed_at = CASE
          WHEN COALESCE($5, ls.is_completed) = TRUE
            THEN COALESCE(ls.completed_at, NOW())
          ELSE NULL
        END,
        notes = COALESCE($6, ls.notes)
      FROM workout_session_exercises wse
      JOIN workout_sessions ws ON ws.id = wse.workout_session_id
      WHERE ls.id = $7
        AND ls.workout_session_exercise_id = wse.id
        AND ws.id = $8 AND ws.user_id = $9
        AND ws.status = 'in_progress'
      RETURNING ls.*`,
      [weightKg, reps, rir, rpe, isCompleted, notes,
        req.params.setId, req.params.id, req.user!.userId]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Logged set not found' });
      return;
    }

    res.json({ message: 'Set updated', set: result.rows[0] });
  } catch (error) {
    console.error('Update set error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

async function finishWorkout(
  req: AuthRequest,
  res: Response,
  status: 'completed' | 'cancelled'
) {
  const result = await query(
    `UPDATE workout_sessions
     SET status = $1::varchar,
         completed_at = CASE WHEN $1::varchar = 'completed' THEN NOW() ELSE NULL END,
         notes = COALESCE($2, notes)
     WHERE id = $3 AND user_id = $4 AND status = 'in_progress'
     RETURNING id`,
    [status, req.body.notes, req.params.id, req.user!.userId]
  );

  if (!result.rows[0]) {
    res.status(404).json({ error: 'Active workout not found' });
    return;
  }

  const workout = await getWorkoutDetails(req.user!.userId, req.params.id);
  res.json({ workout });
}

export const completeWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await finishWorkout(req, res, 'completed');
  } catch (error) {
    console.error('Complete workout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const cancelWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await finishWorkout(req, res, 'cancelled');
  } catch (error) {
    console.error('Cancel workout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
