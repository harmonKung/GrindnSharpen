import { Router } from 'express';
import {
  generateRoutine,
  getRoutine,
  listRoutines,
} from '../controllers/routineController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/generate', generateRoutine);
router.get('/', listRoutines);
router.get('/:id', getRoutine);

export default router;
