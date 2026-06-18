"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const profileControllers_1 = require("../controllers/profileControllers");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/', profileControllers_1.getProfile);
router.patch('/', [
    (0, express_validator_1.body)('displayName').optional().isLength({ max: 100 }),
    (0, express_validator_1.body)('dateOfBirth').optional().isISO8601().toDate(),
    (0, express_validator_1.body)('gender')
        .optional()
        .isIn(['male', 'female', 'non_binary', 'prefer_not_to_say']),
    (0, express_validator_1.body)('bodyWeightKg').optional().isFloat({ min: 20, max: 500 }),
    (0, express_validator_1.body)('heightCm').optional().isFloat({ min: 50, max: 300 }),
    (0, express_validator_1.body)('bodyFatPct').optional().isFloat({ min: 1, max: 70 }),
    (0, express_validator_1.body)('experienceLevel').optional().isIn(['beginner', 'intermediate', 'advanced']),
    (0, express_validator_1.body)('primaryGoal')
        .optional()
        .isIn(['build_muscle', 'lose_fat', 'recomp', 'strength', 'endurance', 'general_fitness']),
    (0, express_validator_1.body)('secondaryGoal').optional().isLength({ max: 50 }),
    (0, express_validator_1.body)('targetWeightKg').optional().isFloat({ min: 20, max: 500 }),
    (0, express_validator_1.body)('targetBodyFatPct').optional().isFloat({ min: 1, max: 70 }),
    (0, express_validator_1.body)('daysPerWeek').optional().isInt({ min: 1, max: 7 }),
    (0, express_validator_1.body)('sessionDurationMin').optional().isInt({ min: 20, max: 180 }),
    (0, express_validator_1.body)('preferredDays').optional().isArray(),
    (0, express_validator_1.body)('equipment').optional().isArray(),
    (0, express_validator_1.body)('physiqueArchetype').optional().isLength({ max: 50 }),
    (0, express_validator_1.body)('limitations').optional().isString(),
], profileControllers_1.updateProfile);
router.post('/onboarding', [
    (0, express_validator_1.body)('step').isInt({ min: 0 }),
    (0, express_validator_1.body)('data').optional().isObject(),
    (0, express_validator_1.body)('isComplete').optional().isBoolean(),
], profileControllers_1.saveOnboardingStep);
exports.default = router;
