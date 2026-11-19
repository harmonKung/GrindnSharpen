import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  getExerciseHistory,
  getProgressSummary,
  deleteBodyWeight,
  deleteDietEntry,
  logDietEntry,
  logBodyWeight,
} from '../controllers/progressController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/summary', getProgressSummary);

router.post(
  '/body-weight',
  [
    body('weightKg').isFloat({ min: 20, max: 500 }),
    body('recordedOn').optional().isISO8601(),
    body('notes').optional({ nullable: true }).isString().isLength({ max: 500 }),
  ],
  logBodyWeight
);

router.delete(
  '/body-weight/:id',
  [param('id').isUUID().withMessage('Valid weight entry ID required')],
  deleteBodyWeight
);

router.post(
  '/diet',
  [
    body('mealType').isIn(['breakfast', 'lunch', 'dinner', 'snack']),
    body('description').isString().trim().isLength({ min: 1, max: 500 }),
    body('calories').optional({ nullable: true }).isInt({ min: 0, max: 10000 }),
    body('recordedOn').optional().isISO8601(),
  ],
  logDietEntry
);

router.delete(
  '/diet/:id',
  [param('id').isUUID().withMessage('Valid diet entry ID required')],
  deleteDietEntry
);

router.get(
  '/exercises/:exerciseId',
  [
    param('exerciseId').isUUID().withMessage('Valid exercise ID required'),
    query('limit').optional().isInt({ min: 1, max: 25 }),
  ],
  getExerciseHistory
);

export default router;
