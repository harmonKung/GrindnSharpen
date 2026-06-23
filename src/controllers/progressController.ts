import { Response } from 'express';
import { validationResult } from 'express-validator';
import { getClient, query } from '../db/database';
import { AuthRequest } from '../middleware/auth';
import { buildProgressionRecommendation, PerformanceSet } from '../services/progressionService';

function formatRecordedDate(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export const getProgressSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const [weeklyResult, weightResult, recordsResult, exercisesResult] = await Promise.all([
      query(
        `SELECT COUNT(DISTINCT ws.id)::int AS workouts,
                COUNT(ls.id) FILTER (WHERE ls.is_completed = TRUE)::int AS sets,
                COALESCE(SUM(ls.weight_kg * ls.reps)
                  FILTER (WHERE ls.is_completed = TRUE), 0) AS volume_kg
         FROM workout_sessions ws
         LEFT JOIN workout_session_exercises wse ON wse.workout_session_id = ws.id
         LEFT JOIN logged_sets ls ON ls.workout_session_exercise_id = wse.id
         WHERE ws.user_id = $1 AND ws.status = 'completed'
           AND ws.completed_at >= CURRENT_DATE - INTERVAL '6 days'
           AND EXISTS (
             SELECT 1 FROM logged_sets completed_set
             JOIN workout_session_exercises completed_exercise
               ON completed_exercise.id = completed_set.workout_session_exercise_id
             WHERE completed_exercise.workout_session_id = ws.id
               AND completed_set.is_completed = TRUE
           )`,
        [userId]
      ),
      query(
        `SELECT id, weight_kg, recorded_on, notes
         FROM body_weight_logs
         WHERE user_id = $1
         ORDER BY recorded_on DESC`,
        [userId]
      ),
      query(
        `SELECT DISTINCT ON (e.id) e.id AS exercise_id, e.name,
                ls.weight_kg, ls.reps,
                ROUND((ls.weight_kg * (1 + ls.reps / 30.0))::numeric, 1) AS estimated_one_rep_max,
                ws.completed_at
         FROM logged_sets ls
         JOIN workout_session_exercises wse ON wse.id = ls.workout_session_exercise_id
         JOIN workout_sessions ws ON ws.id = wse.workout_session_id
         JOIN exercises e ON e.id = wse.exercise_id
         WHERE ws.user_id = $1 AND ws.status = 'completed'
           AND ls.is_completed = TRUE AND ls.set_type = 'working'
           AND ls.weight_kg IS NOT NULL AND ls.reps > 0
         ORDER BY e.id, (ls.weight_kg * (1 + ls.reps / 30.0)) DESC
         LIMIT 8`,
        [userId]
      ),
      query(
        `SELECT e.id, e.name, e.primary_muscle,
                MAX(ws.completed_at) AS last_trained_at
         FROM workout_sessions ws
         JOIN workout_session_exercises wse ON wse.workout_session_id = ws.id
         JOIN exercises e ON e.id = wse.exercise_id
         WHERE ws.user_id = $1 AND ws.status = 'completed'
         GROUP BY e.id, e.name, e.primary_muscle
         ORDER BY MAX(ws.completed_at) DESC, e.name`,
        [userId]
      ),
    ]);

    const weekly = weeklyResult.rows[0];
    res.json({
      weekly: {
        workouts: weekly.workouts,
        sets: weekly.sets,
        volumeKg: Number(weekly.volume_kg),
      },
      bodyWeight: weightResult.rows.map((row) => ({
        id: row.id,
        weightKg: Number(row.weight_kg),
        recordedOn: formatRecordedDate(row.recorded_on),
        notes: row.notes,
      })),
      personalRecords: recordsResult.rows.map((row) => ({
        exerciseId: row.exercise_id,
        name: row.name,
        weightKg: Number(row.weight_kg),
        reps: row.reps,
        estimatedOneRepMax: Number(row.estimated_one_rep_max),
        completedAt: row.completed_at,
      })),
      trackedExercises: exercisesResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        primaryMuscle: row.primary_muscle,
        lastTrainedAt: row.last_trained_at,
      })),
    });
  } catch (error) {
    console.error('Get progress summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logBodyWeight = async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO body_weight_logs (user_id, weight_kg, recorded_on, notes)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4)
       ON CONFLICT (user_id, recorded_on) DO UPDATE
       SET weight_kg = EXCLUDED.weight_kg, notes = EXCLUDED.notes
       RETURNING id, weight_kg, recorded_on, notes`,
      [req.user!.userId, req.body.weightKg, req.body.recordedOn ?? null, req.body.notes ?? null]
    );
    await client.query(
      'UPDATE user_profiles SET body_weight_kg = $1 WHERE user_id = $2',
      [req.body.weightKg, req.user!.userId]
    );
    await client.query('COMMIT');

    const row = result.rows[0];
    res.status(201).json({
      entry: {
        id: row.id,
        weightKg: Number(row.weight_kg),
        recordedOn: formatRecordedDate(row.recorded_on),
        notes: row.notes,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Log body weight error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const deleteBodyWeight = async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const deleted = await client.query(
      'DELETE FROM body_weight_logs WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user!.userId]
    );
    if (!deleted.rows[0]) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Weight entry not found' });
      return;
    }

    const latest = await client.query(
      `SELECT weight_kg FROM body_weight_logs
       WHERE user_id = $1 ORDER BY recorded_on DESC LIMIT 1`,
      [req.user!.userId]
    );
    const latestWeightKg = latest.rows[0] ? Number(latest.rows[0].weight_kg) : null;
    await client.query(
      'UPDATE user_profiles SET body_weight_kg = $1 WHERE user_id = $2',
      [latestWeightKg, req.user!.userId]
    );
    await client.query('COMMIT');
    res.json({ message: 'Weight entry deleted', latestWeightKg });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Delete body weight error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const getExerciseHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const limit = Number(req.query.limit ?? 10);
    const exerciseResult = await query(
      'SELECT id, name, primary_muscle FROM exercises WHERE id = $1',
      [req.params.exerciseId]
    );
    const exercise = exerciseResult.rows[0];

    if (!exercise) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }

    const result = await query(
      `SELECT ws.id AS workout_id, ws.name AS workout_name,
              ws.completed_at, wse.prescribed_rep_min, wse.prescribed_rep_max,
              wse.target_rir, ls.set_number, ls.weight_kg, ls.reps, ls.rir
       FROM workout_sessions ws
       JOIN workout_session_exercises wse ON wse.workout_session_id = ws.id
       JOIN logged_sets ls ON ls.workout_session_exercise_id = wse.id
       WHERE ws.user_id = $1 AND wse.exercise_id = $2
         AND ws.status = 'completed' AND ls.is_completed = TRUE
         AND ls.set_type = 'working'
       ORDER BY ws.completed_at DESC, ls.set_number
       LIMIT $3`,
      [req.user!.userId, req.params.exerciseId, limit * 20]
    );

    const sessions = new Map<string, {
      workoutId: string;
      workoutName: string;
      completedAt: string;
      repMin: number | null;
      repMax: number | null;
      targetRir: number | null;
      sets: PerformanceSet[];
    }>();

    for (const row of result.rows) {
      if (!sessions.has(row.workout_id) && sessions.size < limit) {
        sessions.set(row.workout_id, {
          workoutId: row.workout_id,
          workoutName: row.workout_name,
          completedAt: row.completed_at,
          repMin: row.prescribed_rep_min,
          repMax: row.prescribed_rep_max,
          targetRir: row.target_rir,
          sets: [],
        });
      }

      const session = sessions.get(row.workout_id);
      if (session) {
        session.sets.push({
          setNumber: row.set_number,
          weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
          reps: row.reps,
          rir: row.rir,
        });
      }
    }

    const history = Array.from(sessions.values());
    const latest = history[0];
    const recommendation = buildProgressionRecommendation(latest?.sets ?? [], {
      repMin: latest?.repMin ?? null,
      repMax: latest?.repMax ?? null,
      targetRir: latest?.targetRir ?? null,
      primaryMuscle: exercise.primary_muscle,
    });

    res.json({
      exercise: {
        id: exercise.id,
        name: exercise.name,
        primaryMuscle: exercise.primary_muscle,
      },
      history,
      recommendation,
    });
  } catch (error) {
    console.error('Get exercise history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
