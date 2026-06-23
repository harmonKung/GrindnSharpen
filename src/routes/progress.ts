import { Router } from 'express';
import { param, query } from 'express-validator';
import { getExerciseHistory } from '../controllers/progressController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get(
  '/exercises/:exerciseId',
  [
    param('exerciseId').isUUID().withMessage('Valid exercise ID required'),
    query('limit').optional().isInt({ min: 1, max: 25 }),
  ],
  getExerciseHistory
);

export default router;
