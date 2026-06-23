import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  query: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock('../src/db/database', () => ({
  query: databaseMocks.query,
  getClient: databaseMocks.getClient,
  default: {},
}));

import app from '../src/app';
import { signAccessToken, signRefreshToken } from '../src/config/jwt';

const userId = '2958117f-e589-42d6-855c-3219158f6aff';
const email = 'test@example.com';

function result(rows: Record<string, unknown>[] = []) {
  return Promise.resolve({ rows });
}

describe('application basics', () => {
  it('returns API health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it('returns JSON for unknown routes', async () => {
    const response = await request(app).get('/not-a-route');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Route not found' });
  });
});

describe('authentication API', () => {
  beforeEach(() => {
    databaseMocks.query.mockReset();
    databaseMocks.getClient.mockReset();
  });

  it('rejects an invalid registration payload before querying the database', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.any(Array));
    expect(databaseMocks.query).not.toHaveBeenCalled();
  });

  it('rejects registration for an existing email', async () => {
    databaseMocks.query.mockReturnValueOnce(result([{ id: userId }]));

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('An account with this email already exists');
  });

  it('registers a user and returns access and refresh tokens', async () => {
    databaseMocks.query
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result([{
        id: userId,
        email,
        created_at: '2026-06-23T12:00:00.000Z',
      }]))
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result());

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'TEST@example.com', password: 'Password123' });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ id: userId, email });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(databaseMocks.query).toHaveBeenCalledTimes(4);

    const insertedUser = databaseMocks.query.mock.calls[1];
    expect(insertedUser[1][0]).toBe(email);
    expect(insertedUser[1][1]).not.toBe('Password123');
  });

  it('rejects login for an unknown user', async () => {
    databaseMocks.query.mockReturnValueOnce(result());

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Password123' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid email or password');
  });

  it('rejects login for a deactivated account', async () => {
    databaseMocks.query.mockReturnValueOnce(result([{
      id: userId,
      email,
      password_hash: bcrypt.hashSync('Password123', 4),
      is_active: false,
    }]));

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Password123' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Account is deactivated');
  });

  it('rejects login when the password is incorrect', async () => {
    databaseMocks.query.mockReturnValueOnce(result([{
      id: userId,
      email,
      password_hash: bcrypt.hashSync('Password123', 4),
      is_active: true,
    }]));

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'WrongPassword123' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid email or password');
  });

  it('logs in an active user and returns onboarding state', async () => {
    databaseMocks.query
      .mockReturnValueOnce(result([{
        id: userId,
        email,
        password_hash: bcrypt.hashSync('Password123', 4),
        is_active: true,
      }]))
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result([{
        onboarding_complete: true,
        onboarding_step: 3,
      }]));

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Password123' });

    expect(response.status).toBe(200);
    expect(response.body.profile).toEqual({ onboardingComplete: true, onboardingStep: 3 });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
  });

  it('requires a refresh token', async () => {
    const response = await request(app).post('/api/auth/refresh').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Refresh token required');
  });

  it('rejects an invalid refresh token', async () => {
    const response = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'not-a-token' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid refresh token');
  });

  it('rotates a valid stored refresh token', async () => {
    const refreshToken = signRefreshToken({ userId, email });
    databaseMocks.query
      .mockReturnValueOnce(result([{ id: 'stored-token-id' }]))
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result());

    const response = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).not.toBe(refreshToken);
    expect(databaseMocks.query).toHaveBeenCalledTimes(3);
  });

  it('protects the current-user endpoint', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Missing or invalid authorization header');
  });

  it('returns the current user for a valid access token', async () => {
    databaseMocks.query.mockReturnValueOnce(result([{
      id: userId,
      email,
      created_at: '2026-06-23T12:00:00.000Z',
      display_name: 'Example Lifter',
      avatar_url: null,
      experience_level: 'beginner',
      primary_goal: 'build_muscle',
      body_weight_kg: '82.00',
      height_cm: '178.0',
      days_per_week: 4,
      onboarding_complete: true,
      onboarding_step: 3,
    }]));
    const token = signAccessToken({ userId, email });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: userId,
      email,
      profile: {
        displayName: 'Example Lifter',
        onboardingComplete: true,
      },
    });
  });
});
