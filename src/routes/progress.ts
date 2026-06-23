import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  getExerciseHistory,
  getProgressSummary,
  deleteBodyWeight,
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
    body('recordedOn').optional().isISO8601().toDate(),
    body('notes').optional({ nullable: true }).isString().isLength({ max: 500 }),
  ],
  logBodyWeight
);

router.delete(
  '/body-weight/:id',
  [param('id').isUUID().withMessage('Valid weight entry ID required')],
  deleteBodyWeight
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
