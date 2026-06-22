import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  cancelWorkout,
  completeWorkout,
  getWorkout,
  listWorkoutHistory,
  startWorkout,
  updateLoggedSet,
  upsertLoggedSet,
} from '../controllers/workoutController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post(
  '/start',
  [body('routineDayId').isUUID().withMessage('Valid routine day ID required')],
  startWorkout
);

router.get('/history', listWorkoutHistory);

router.post(
  '/:id/sets',
  [
    param('id').isUUID(),
    body('sessionExerciseId').isUUID().withMessage('Valid session exercise ID required'),
    body('setNumber').isInt({ min: 1, max: 100 }),
    body('setType').optional().isIn(['warmup', 'working', 'drop', 'failure']),
    body('weightKg').optional({ nullable: true }).isFloat({ min: 0, max: 2000 }),
    body('reps').isInt({ min: 0, max: 1000 }),
    body('rir').optional({ nullable: true }).isInt({ min: 0, max: 10 }),
    body('rpe').optional({ nullable: true }).isFloat({ min: 1, max: 10 }),
    body('isCompleted').optional().isBoolean(),
    body('notes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  ],
  upsertLoggedSet
);

router.patch(
  '/:id/sets/:setId',
  [
    param('id').isUUID(),
    param('setId').isUUID(),
    body().custom((value) => {
      const editable = ['weightKg', 'reps', 'rir', 'rpe', 'isCompleted', 'notes'];
      if (!editable.some((field) => value[field] !== undefined)) {
        throw new Error('At least one editable set field is required');
      }
      return true;
    }),
    body('weightKg').optional({ nullable: true }).isFloat({ min: 0, max: 2000 }),
    body('reps').optional().isInt({ min: 0, max: 1000 }),
    body('rir').optional({ nullable: true }).isInt({ min: 0, max: 10 }),
    body('rpe').optional({ nullable: true }).isFloat({ min: 1, max: 10 }),
    body('isCompleted').optional().isBoolean(),
    body('notes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  ],
  updateLoggedSet
);

router.post(
  '/:id/complete',
  [param('id').isUUID(), body('notes').optional().isString().isLength({ max: 4000 })],
  completeWorkout
);

router.post(
  '/:id/cancel',
  [param('id').isUUID(), body('notes').optional().isString().isLength({ max: 4000 })],
  cancelWorkout
);

router.get('/:id', [param('id').isUUID()], getWorkout);

export default router;
