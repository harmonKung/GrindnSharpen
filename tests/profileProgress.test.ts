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
import { signAccessToken } from '../src/config/jwt';

const userId = '1958117f-e589-42d6-855c-3219158f6aff';
const profileId = '2958117f-e589-42d6-855c-3219158f6aff';
const weightId = '3958117f-e589-42d6-855c-3219158f6aff';
const exerciseId = '4958117f-e589-42d6-855c-3219158f6aff';
const workoutId = '5958117f-e589-42d6-855c-3219158f6aff';
const token = signAccessToken({ userId, email: 'test@example.com' });

function result(rows: Record<string, unknown>[] = []) {
  return Promise.resolve({ rows });
}

function authenticated(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
  return request(app)[method](path).set('Authorization', `Bearer ${token}`);
}

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: profileId,
    user_id: userId,
    display_name: 'Example Lifter',
    avatar_url: null,
    date_of_birth: null,
    gender: null,
    body_weight_kg: '82.00',
    height_cm: '178.0',
    body_fat_pct: null,
    unit_preference: 'kg',
    experience_level: 'beginner',
    primary_goal: 'build_muscle',
    secondary_goal: null,
    target_weight_kg: null,
    target_body_fat_pct: null,
    days_per_week: 4,
    session_duration_min: 60,
    preferred_days: null,
    equipment: ['gym_full'],
    physique_archetype: 'lean_aesthetic',
    limitations: null,
    onboarding_complete: true,
    onboarding_step: 3,
    created_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-06-24T12:00:00.000Z',
    ...overrides,
  };
}

describe('profile API', () => {
  beforeEach(() => {
    databaseMocks.query.mockReset();
    databaseMocks.getClient.mockReset();
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/profile');

    expect(response.status).toBe(401);
    expect(databaseMocks.query).not.toHaveBeenCalled();
  });

  it('returns a camelCase profile owned by the current user', async () => {
    databaseMocks.query.mockReturnValueOnce(result([profileRow()]));

    const response = await authenticated('get', '/api/profile');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: profileId,
      userId,
      displayName: 'Example Lifter',
      bodyWeightKg: '82.00',
      unitPreference: 'kg',
      experienceLevel: 'beginner',
      primaryGoal: 'build_muscle',
    });
    expect(response.body).not.toHaveProperty('display_name');
    expect(databaseMocks.query.mock.calls[0][1]).toEqual([userId]);
  });

  it('returns 404 when the current user has no profile', async () => {
    databaseMocks.query.mockReturnValueOnce(result());

    const response = await authenticated('get', '/api/profile');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Profile not found');
  });

  it('validates profile updates before querying the database', async () => {
    const response = await authenticated('patch', '/api/profile')
      .send({ bodyWeightKg: 5, unitPreference: 'stone', daysPerWeek: 9 });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.any(Array));
    expect(databaseMocks.query).not.toHaveBeenCalled();
  });

  it('updates and returns a normalized profile', async () => {
    databaseMocks.query.mockReturnValueOnce(result([profileRow({
      display_name: 'Updated Lifter',
      unit_preference: 'lb',
    })]));

    const response = await authenticated('patch', '/api/profile')
      .send({ displayName: 'Updated Lifter', unitPreference: 'lb' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: 'Profile updated',
      profile: {
        displayName: 'Updated Lifter',
        unitPreference: 'lb',
      },
    });
    const parameters = databaseMocks.query.mock.calls[0][1];
    expect(parameters[0]).toBe('Updated Lifter');
    expect(parameters[17]).toBe('lb');
    expect(parameters[18]).toBe(userId);
  });

  it('does not update a missing owned profile', async () => {
    databaseMocks.query.mockReturnValueOnce(result());

    const response = await authenticated('patch', '/api/profile')
      .send({ displayName: 'Updated Lifter' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Profile not found');
  });
});

describe('progress API', () => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };

  beforeEach(() => {
    databaseMocks.query.mockReset();
    databaseMocks.getClient.mockReset();
    client.query.mockReset();
    client.release.mockReset();
    databaseMocks.getClient.mockResolvedValue(client);
  });

  it('requires authentication for progress summaries', async () => {
    const response = await request(app).get('/api/progress/summary');

    expect(response.status).toBe(401);
    expect(databaseMocks.query).not.toHaveBeenCalled();
  });

  it('maps the dashboard summary into API response fields', async () => {
    databaseMocks.query
      .mockReturnValueOnce(result([{ workouts: 3, sets: 24, volume_kg: '8400.50' }]))
      .mockReturnValueOnce(result([{
        id: weightId,
        weight_kg: '81.50',
        recorded_on: new Date('2026-06-24T04:00:00.000Z'),
        notes: null,
      }]))
      .mockReturnValueOnce(result([{
        exercise_id: exerciseId,
        name: 'Bench Press',
        weight_kg: '80.00',
        reps: 10,
        estimated_one_rep_max: '106.7',
        completed_at: '2026-06-23T12:00:00.000Z',
      }]))
      .mockReturnValueOnce(result([{
        id: exerciseId,
        name: 'Bench Press',
        primary_muscle: 'chest',
        last_trained_at: '2026-06-23T12:00:00.000Z',
      }]));

    const response = await authenticated('get', '/api/progress/summary');

    expect(response.status).toBe(200);
    expect(response.body.weekly).toEqual({ workouts: 3, sets: 24, volumeKg: 8400.5 });
    expect(response.body.bodyWeight[0]).toEqual({
      id: weightId,
      weightKg: 81.5,
      recordedOn: '2026-06-24',
      notes: null,
    });
    expect(response.body.personalRecords[0].estimatedOneRepMax).toBe(106.7);
    expect(response.body.trackedExercises[0].primaryMuscle).toBe('chest');
    expect(databaseMocks.query).toHaveBeenCalledTimes(4);
  });

  it('validates weight check-ins before opening a transaction', async () => {
    const response = await authenticated('post', '/api/progress/body-weight')
      .send({ weightKg: 5, recordedOn: 'not-a-date' });

    expect(response.status).toBe(400);
    expect(databaseMocks.getClient).not.toHaveBeenCalled();
  });

  it('logs body weight and synchronizes the profile weight', async () => {
    client.query
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result([{
        id: weightId,
        weight_kg: '81.40',
        recorded_on: new Date('2026-06-24T04:00:00.000Z'),
        notes: 'Morning',
      }]))
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result());

    const response = await authenticated('post', '/api/progress/body-weight')
      .send({ weightKg: 81.4, recordedOn: '2026-06-24', notes: 'Morning' });

    expect(response.status).toBe(201);
    expect(response.body.entry).toEqual({
      id: weightId,
      weightKg: 81.4,
      recordedOn: '2026-06-24',
      notes: 'Morning',
    });
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith(
      'UPDATE user_profiles SET body_weight_kg = $1 WHERE user_id = $2',
      [81.4, userId]
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('does not delete another user’s weight entry', async () => {
    client.query
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result());

    const response = await authenticated('delete', `/api/progress/body-weight/${weightId}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Weight entry not found');
    expect(client.query.mock.calls[1][1]).toEqual([weightId, userId]);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('deletes an owned weight entry and restores the latest profile weight', async () => {
    client.query
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result([{ id: weightId }]))
      .mockReturnValueOnce(result([{ weight_kg: '80.75' }]))
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result());

    const response = await authenticated('delete', `/api/progress/body-weight/${weightId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Weight entry deleted', latestWeightKg: 80.75 });
    expect(client.query).toHaveBeenCalledWith(
      'UPDATE user_profiles SET body_weight_kg = $1 WHERE user_id = $2',
      [80.75, userId]
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('returns 404 for an unknown exercise', async () => {
    databaseMocks.query.mockReturnValueOnce(result());

    const response = await authenticated('get', `/api/progress/exercises/${exerciseId}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Exercise not found');
  });

  it('returns exercise history and a progression recommendation', async () => {
    databaseMocks.query
      .mockReturnValueOnce(result([{
        id: exerciseId,
        name: 'Bench Press',
        primary_muscle: 'chest',
      }]))
      .mockReturnValueOnce(result([
        {
          workout_id: workoutId,
          workout_name: 'Push Day',
          completed_at: '2026-06-23T12:00:00.000Z',
          prescribed_rep_min: 8,
          prescribed_rep_max: 12,
          target_rir: 2,
          set_number: 1,
          weight_kg: '80.00',
          reps: 12,
          rir: 2,
        },
        {
          workout_id: workoutId,
          workout_name: 'Push Day',
          completed_at: '2026-06-23T12:00:00.000Z',
          prescribed_rep_min: 8,
          prescribed_rep_max: 12,
          target_rir: 2,
          set_number: 2,
          weight_kg: '80.00',
          reps: 12,
          rir: 2,
        },
      ]));

    const response = await authenticated('get', `/api/progress/exercises/${exerciseId}?limit=5`);

    expect(response.status).toBe(200);
    expect(response.body.exercise).toEqual({ id: exerciseId, name: 'Bench Press', primaryMuscle: 'chest' });
    expect(response.body.history[0].sets).toHaveLength(2);
    expect(response.body.recommendation).toMatchObject({
      action: 'add_weight',
      weightKg: 82.5,
      reps: 8,
    });
    expect(databaseMocks.query.mock.calls[1][1]).toEqual([userId, exerciseId, 100]);
  });
});
