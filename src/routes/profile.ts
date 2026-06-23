import { Router } from 'express';
import { body } from 'express-validator';
import {
  getProfile,
  saveOnboardingStep,
  updateProfile,
} from '../controllers/profileControllers';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', getProfile);

router.patch(
  '/',
  [
    body('displayName').optional().isLength({ max: 100 }),
    body('dateOfBirth').optional().isISO8601().toDate(),
    body('gender')
      .optional()
      .isIn(['male', 'female', 'non_binary', 'prefer_not_to_say']),
    body('bodyWeightKg').optional().isFloat({ min: 20, max: 500 }),
    body('heightCm').optional().isFloat({ min: 50, max: 300 }),
    body('bodyFatPct').optional().isFloat({ min: 1, max: 70 }),
    body('experienceLevel').optional().isIn(['beginner', 'intermediate', 'advanced']),
    body('primaryGoal')
      .optional()
      .isIn(['build_muscle', 'lose_fat', 'recomp', 'strength', 'endurance', 'general_fitness']),
    body('secondaryGoal').optional().isLength({ max: 50 }),
    body('targetWeightKg').optional().isFloat({ min: 20, max: 500 }),
    body('targetBodyFatPct').optional().isFloat({ min: 1, max: 70 }),
    body('daysPerWeek').optional().isInt({ min: 1, max: 7 }),
    body('sessionDurationMin').optional().isInt({ min: 20, max: 180 }),
    body('preferredDays').optional().isArray(),
    body('equipment').optional().isArray(),
    body('physiqueArchetype').optional().isLength({ max: 50 }),
    body('limitations').optional().isString(),
    body('unitPreference').optional().isIn(['kg', 'lb']),
  ],
  updateProfile
);

router.post(
  '/onboarding',
  [
    body('step').isInt({ min: 0 }),
    body('data').optional().isObject(),
    body('isComplete').optional().isBoolean(),
  ],
  saveOnboardingStep
);

export default router;
