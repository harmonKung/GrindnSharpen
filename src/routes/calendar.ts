import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  createTrainingSchedule,
  getTrainingCalendar,
  moveScheduledWorkout,
} from '../controllers/calendarController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', getTrainingCalendar);

router.post(
  '/schedule',
  [
    body('routineId').isUUID().withMessage('Valid routine ID required'),
    body('weekdays')
      .isArray({ min: 1, max: 7 })
      .withMessage('Choose at least one training day')
      .custom((weekdays: unknown) =>
        Array.isArray(weekdays) && new Set(weekdays).size === weekdays.length
      )
      .withMessage('Training days must be unique'),
    body('weekdays.*').isInt({ min: 0, max: 6 }).withMessage('Training days must be weekdays'),
  ],
  createTrainingSchedule
);

router.patch(
  '/:id',
  [
    param('id').isUUID(),
    body('scheduledDate')
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .custom((value: string) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
      })
      .withMessage('A valid scheduled date is required'),
  ],
  moveScheduledWorkout
);

export default router;
