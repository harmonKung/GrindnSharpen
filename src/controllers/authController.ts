import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { validationResult } from 'express-validator';
import { query } from '../config/database';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  refreshTokenExpiresAt,
} from '../config/jwt';
import { AuthRequest } from '../middleware/auth';

// ─── Register ───────────────────────────────────────────────────────────────

export const register = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { email, password } = req.body;

  try {
    // Check if user already exists
    const existing = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email.toLowerCase(), passwordHash]
    );
    const user = result.rows[0];

    // Create empty profile
    await query(
      'INSERT INTO user_profiles (user_id) VALUES ($1)',
      [user.id]
    );

    // Issue tokens
    const payload = { userId: user.id, email: user.email };
    const accessToken  = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashToken(refreshToken), refreshTokenExpiresAt()]
    );

    res.status(201).json({
      user:         { id: user.id, email: user.email, createdAt: user.created_at },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────

export const login = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { email, password } = req.body;

  try {
    const result = await query(
      'SELECT id, email, password_hash, is_active FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ error: 'Account is deactivated' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Issue tokens
    const payload = { userId: user.id, email: user.email };
    const accessToken  = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashToken(refreshToken), refreshTokenExpiresAt()]
    );

    // Fetch profile to return onboarding state
    const profileResult = await query(
      'SELECT onboarding_complete, onboarding_step FROM user_profiles WHERE user_id = $1',
      [user.id]
    );
    const profile = profileResult.rows[0];

    res.json({
      user: { id: user.id, email: user.email },
      profile: {
        onboardingComplete: profile?.onboarding_complete ?? false,
        onboardingStep:     profile?.onboarding_step     ?? 0,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Refresh Token ────────────────────────────────────────────────────────────

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token required' });
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);

    const stored = await query(
      `SELECT id FROM refresh_tokens
       WHERE token_hash = $1 AND user_id = $2 AND revoked = FALSE AND expires_at > NOW()`,
      [tokenHash, payload.userId]
    );

    if (stored.rows.length === 0) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    // Rotate: revoke old, issue new
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [tokenHash]);

    const newAccessToken  = signAccessToken({ userId: payload.userId, email: payload.email });
    const newRefreshToken = signRefreshToken({ userId: payload.userId, email: payload.email });

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [payload.userId, hashToken(newRefreshToken), refreshTokenExpiresAt()]
    );

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logout = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    try {
      await query(
        'UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1',
        [hashToken(refreshToken)]
      );
    } catch (err) {
      console.error('Logout token revocation error:', err);
    }
  }

  res.json({ message: 'Logged out successfully' });
};

// ─── Me (current user) ────────────────────────────────────────────────────────

export const me = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.created_at,
              p.display_name, p.avatar_url, p.experience_level, p.primary_goal,
              p.body_weight_kg, p.height_cm, p.days_per_week,
              p.onboarding_complete, p.onboarding_step
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user!.userId]
    );

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id:          row.id,
      email:       row.email,
      createdAt:   row.created_at,
      profile: {
        displayName:        row.display_name,
        avatarUrl:          row.avatar_url,
        experienceLevel:    row.experience_level,
        primaryGoal:        row.primary_goal,
        bodyWeightKg:       row.body_weight_kg,
        heightCm:           row.height_cm,
        daysPerWeek:        row.days_per_week,
        onboardingComplete: row.onboarding_complete,
        onboardingStep:     row.onboarding_step,
      },
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};