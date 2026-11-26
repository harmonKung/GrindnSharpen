import { Response } from 'express';
import { validationResult } from 'express-validator';
import { getClient, query } from '../db/database';
import { AuthRequest } from '../middleware/auth';

function hasValidationErrors(req: AuthRequest, res: Response) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;

  res.status(400).json({ errors: errors.array() });
  return true;
}

function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export const getTrainingCalendar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await query(
      `UPDATE scheduled_workouts
       SET status = 'missed'
       WHERE user_id = $1 AND status = 'scheduled'
         AND scheduled_date < CURRENT_DATE`,
      [req.user!.userId]
    );

    const result = await query(
      `SELECT sw.id, sw.routine_id, sw.routine_day_id, sw.scheduled_date,
              sw.status, r.name AS routine_name, rd.name AS routine_day_name
       FROM scheduled_workouts sw
       JOIN routines r ON r.id = sw.routine_id
       JOIN routine_days rd ON rd.id = sw.routine_day_id
       WHERE sw.user_id = $1
         AND (
           sw.status = 'missed'
           OR (sw.status = 'scheduled'
             AND sw.scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)
         )
       ORDER BY sw.scheduled_date, rd.day_number
       LIMIT 50`,
      [req.user!.userId]
    );

    res.json({
      workouts: result.rows.map((workout) => ({
        id: workout.id,
        routineId: workout.routine_id,
        routineDayId: workout.routine_day_id,
        routineName: workout.routine_name,
        routineDayName: workout.routine_day_name,
        scheduledDate: dateOnly(workout.scheduled_date),
        status: workout.status,
      })),
    });
  } catch (error) {
    console.error('Get training calendar error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createTrainingSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  const client = await getClient();
  let transactionStarted = false;
  try {
    const { routineId, weekdays } = req.body as { routineId: string; weekdays: number[] };
    const routineResult = await client.query(
      `SELECT id, days_per_week
       FROM routines
       WHERE id = $1 AND user_id = $2`,
      [routineId, req.user!.userId]
    );
    const routine = routineResult.rows[0];
    if (!routine) {
      res.status(404).json({ error: 'Routine not found' });
      return;
    }

    const daysResult = await client.query(
      `SELECT id, name
       FROM routine_days
       WHERE routine_id = $1
       ORDER BY day_number`,
      [routine.id]
    );
    if (weekdays.length !== routine.days_per_week || daysResult.rows.length !== routine.days_per_week) {
      res.status(422).json({ error: 'Choose one weekday for each routine day' });
      return;
    }

    await client.query('BEGIN');
    transactionStarted = true;
    await client.query(
      `DELETE FROM scheduled_workouts
       WHERE user_id = $1 AND status = 'scheduled'
         AND scheduled_date >= CURRENT_DATE
         AND workout_session_id IS NULL`,
      [req.user!.userId]
    );

    const datesResult = await client.query(
      `SELECT day::date AS scheduled_date
       FROM generate_series(CURRENT_DATE, CURRENT_DATE + 27, INTERVAL '1 day') AS day
       WHERE EXTRACT(DOW FROM day)::int = ANY($1::int[])
       ORDER BY day`,
      [weekdays]
    );

    for (let index = 0; index < datesResult.rows.length; index += 1) {
      const routineDay = daysResult.rows[index % daysResult.rows.length];
      await client.query(
        `INSERT INTO scheduled_workouts (
          user_id, routine_id, routine_day_id, scheduled_date
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, scheduled_date)
        DO UPDATE SET routine_id = EXCLUDED.routine_id,
                      routine_day_id = EXCLUDED.routine_day_id
        WHERE scheduled_workouts.workout_session_id IS NULL`,
        [req.user!.userId, routine.id, routineDay.id, datesResult.rows[index].scheduled_date]
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;
    res.status(201).json({ message: 'Training schedule created', scheduledCount: datesResult.rows.length });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
    console.error('Create training schedule error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const moveScheduledWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const { scheduledDate } = req.body as { scheduledDate: string };
    const result = await query(
      `UPDATE scheduled_workouts
       SET scheduled_date = $1, status = 'scheduled'
       WHERE id = $2 AND user_id = $3
         AND status IN ('scheduled', 'missed')
         AND workout_session_id IS NULL
         AND $1::date >= CURRENT_DATE
         AND NOT EXISTS (
           SELECT 1 FROM scheduled_workouts existing
           WHERE existing.user_id = $3
             AND existing.scheduled_date = $1
             AND existing.id <> scheduled_workouts.id
         )
       RETURNING id, routine_id, routine_day_id, scheduled_date, status`,
      [scheduledDate, req.params.id, req.user!.userId]
    );

    if (!result.rows[0]) {
      const existingResult = await query(
        `SELECT id FROM scheduled_workouts
         WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user!.userId]
      );
      if (!existingResult.rows[0]) {
        res.status(404).json({ error: 'Scheduled workout not found' });
        return;
      }

      const conflictResult = await query(
        `SELECT id FROM scheduled_workouts
         WHERE user_id = $1
           AND scheduled_date = $2
           AND id <> $3`,
        [req.user!.userId, scheduledDate, req.params.id]
      );
      if (conflictResult.rows[0]) {
        res.status(409).json({ error: 'A workout is already scheduled for that date' });
        return;
      }

      res.status(422).json({ error: 'Choose today or a future date for an unstarted workout' });
      return;
    }

    res.json({
      workout: {
        id: result.rows[0].id,
        routineId: result.rows[0].routine_id,
        routineDayId: result.rows[0].routine_day_id,
        scheduledDate: dateOnly(result.rows[0].scheduled_date),
        status: result.rows[0].status,
      },
    });
  } catch (error) {
    console.error('Move scheduled workout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
