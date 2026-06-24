import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  generateRoutine,
  getRoutine,
  listRoutines,
} from '../controllers/routineController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

const generationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Routine generation limit reached. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/generate', generationLimiter, generateRoutine);
router.get('/', listRoutines);
router.get('/:id', getRoutine);

export default router;
