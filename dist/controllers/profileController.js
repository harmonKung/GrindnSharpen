"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveOnboardingStep = exports.updateProfile = exports.getProfile = void 0;
const express_validator_1 = require("express-validator");
const database_1 = require("../db/database");
// ─── Get full profile ─────────────────────────────────────────────────────────
const getProfile = async (req, res) => {
    try {
        const result = await (0, database_1.query)('SELECT * FROM user_profiles WHERE user_id = $1', [req.user.userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }
        const p = result.rows[0];
        res.json({
            id: p.id,
            userId: p.user_id,
            displayName: p.display_name,
            avatarUrl: p.avatar_url,
            dateOfBirth: p.date_of_birth,
            gender: p.gender,
            bodyWeightKg: p.body_weight_kg,
            heightCm: p.height_cm,
            bodyFatPct: p.body_fat_pct,
            experienceLevel: p.experience_level,
            primaryGoal: p.primary_goal,
            secondaryGoal: p.secondary_goal,
            targetWeightKg: p.target_weight_kg,
            targetBodyFatPct: p.target_body_fat_pct,
            daysPerWeek: p.days_per_week,
            sessionDurationMin: p.session_duration_min,
            preferredDays: p.preferred_days,
            equipment: p.equipment,
            physiqueArchetype: p.physique_archetype,
            limitations: p.limitations,
            onboardingComplete: p.onboarding_complete,
            onboardingStep: p.onboarding_step,
            createdAt: p.created_at,
            updatedAt: p.updated_at,
        });
    }
    catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getProfile = getProfile;
// ─── Update profile ───────────────────────────────────────────────────────────
const updateProfile = async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
    }
    const { displayName, dateOfBirth, gender, bodyWeightKg, heightCm, bodyFatPct, experienceLevel, primaryGoal, secondaryGoal, targetWeightKg, targetBodyFatPct, daysPerWeek, sessionDurationMin, preferredDays, equipment, physiqueArchetype, limitations, } = req.body;
    try {
        const result = await (0, database_1.query)(`UPDATE user_profiles SET
        display_name         = COALESCE($1,  display_name),
        date_of_birth        = COALESCE($2,  date_of_birth),
        gender               = COALESCE($3,  gender),
        body_weight_kg       = COALESCE($4,  body_weight_kg),
        height_cm            = COALESCE($5,  height_cm),
        body_fat_pct         = COALESCE($6,  body_fat_pct),
        experience_level     = COALESCE($7,  experience_level),
        primary_goal         = COALESCE($8,  primary_goal),
        secondary_goal       = COALESCE($9,  secondary_goal),
        target_weight_kg     = COALESCE($10, target_weight_kg),
        target_body_fat_pct  = COALESCE($11, target_body_fat_pct),
        days_per_week        = COALESCE($12, days_per_week),
        session_duration_min = COALESCE($13, session_duration_min),
        preferred_days       = COALESCE($14, preferred_days),
        equipment            = COALESCE($15, equipment),
        physique_archetype   = COALESCE($16, physique_archetype),
        limitations          = COALESCE($17, limitations)
      WHERE user_id = $18
      RETURNING *`, [
            displayName, dateOfBirth, gender,
            bodyWeightKg, heightCm, bodyFatPct,
            experienceLevel, primaryGoal, secondaryGoal,
            targetWeightKg, targetBodyFatPct,
            daysPerWeek, sessionDurationMin,
            preferredDays ? preferredDays : null,
            equipment ? equipment : null,
            physiqueArchetype, limitations,
            req.user.userId,
        ]);
        res.json({ message: 'Profile updated', profile: result.rows[0] });
    }
    catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.updateProfile = updateProfile;
// ─── Save onboarding step ─────────────────────────────────────────────────────
const saveOnboardingStep = async (req, res) => {
    const { step, data, isComplete } = req.body;
    try {
        // Build dynamic SET clause from step data
        const fields = ['onboarding_step = $1'];
        const values = [step];
        let idx = 2;
        const fieldMap = {
            displayName: 'display_name',
            gender: 'gender',
            dateOfBirth: 'date_of_birth',
            bodyWeightKg: 'body_weight_kg',
            heightCm: 'height_cm',
            bodyFatPct: 'body_fat_pct',
            experienceLevel: 'experience_level',
            primaryGoal: 'primary_goal',
            secondaryGoal: 'secondary_goal',
            targetWeightKg: 'target_weight_kg',
            targetBodyFatPct: 'target_body_fat_pct',
            daysPerWeek: 'days_per_week',
            sessionDurationMin: 'session_duration_min',
            preferredDays: 'preferred_days',
            equipment: 'equipment',
            physiqueArchetype: 'physique_archetype',
            limitations: 'limitations',
        };
        if (data) {
            for (const [key, col] of Object.entries(fieldMap)) {
                if (data[key] !== undefined) {
                    fields.push(`${col} = $${idx}`);
                    values.push(data[key]);
                    idx++;
                }
            }
        }
        if (isComplete) {
            fields.push(`onboarding_complete = TRUE`);
        }
        values.push(req.user.userId);
        await (0, database_1.query)(`UPDATE user_profiles SET ${fields.join(', ')} WHERE user_id = $${idx}`, values);
        res.json({ message: 'Step saved', step, isComplete: !!isComplete });
    }
    catch (err) {
        console.error('Onboarding step error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.saveOnboardingStep = saveOnboardingStep;
