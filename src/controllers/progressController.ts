import { Response } from 'express';
import { validationResult } from 'express-validator';
import { query } from '../db/database';
import { AuthRequest } from '../middleware/auth';
import { buildProgressionRecommendation, PerformanceSet } from '../services/progressionService';

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
