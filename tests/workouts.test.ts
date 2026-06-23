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

const userId = '2958117f-e589-42d6-855c-3219158f6aff';
const workoutId = '8958117f-e589-42d6-855c-3219158f6aff';
const dayId = '3958117f-e589-42d6-855c-3219158f6aff';
const exerciseId = '4958117f-e589-42d6-855c-3219158f6aff';
const routineExerciseId = '5958117f-e589-42d6-855c-3219158f6aff';
const sessionExerciseId = '6958117f-e589-42d6-855c-3219158f6aff';
const setId = '7958117f-e589-42d6-855c-3219158f6aff';
const token = signAccessToken({ userId, email: 'test@example.com' });

function result(rows: Record<string, unknown>[] = []) {
  return Promise.resolve({ rows });
}

function authenticated(method: 'get' | 'post' | 'delete', path: string) {
  return request(app)[method](path).set('Authorization', `Bearer ${token}`);
}

function workoutRow(status = 'in_progress') {
  return {
    id: workoutId,
    routine_id: '1958117f-e589-42d6-855c-3219158f6aff',
    routine_day_id: dayId,
    routine_name: 'Muscle Building Routine',
    day_number: 1,
    name: 'Push Day',
    status,
    started_at: '2026-06-23T12:00:00.000Z',
    completed_at: status === 'completed' ? '2026-06-23T13:00:00.000Z' : null,
    notes: null,
  };
}

function exerciseRow() {
  return {
    session_exercise_id: sessionExerciseId,
    exercise_id: exerciseId,
    exercise_order: 1,
    prescribed_sets: 3,
    prescribed_rep_min: 8,
    prescribed_rep_max: 12,
    target_rir: 2,
    rest_seconds: 90,
    exercise_notes: null,
    exercise_name: 'Bench Press',
    primary_muscle: 'chest',
    set_id: null,
  };
}

describe('workout API', () => {
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

  it('requires authentication to start a workout', async () => {
    const response = await request(app).post('/api/workouts/start').send({ routineDayId: dayId });

    expect(response.status).toBe(401);
    expect(databaseMocks.getClient).not.toHaveBeenCalled();
  });

  it('validates the routine day ID before opening a database client', async () => {
    const response = await authenticated('post', '/api/workouts/start')
      .send({ routineDayId: 'not-a-uuid' });

    expect(response.status).toBe(400);
    expect(databaseMocks.getClient).not.toHaveBeenCalled();
  });

  it('prevents a user from starting a second active workout', async () => {
    client.query.mockReturnValueOnce(result([{ id: workoutId }]));

    const response = await authenticated('post', '/api/workouts/start')
      .send({ routineDayId: dayId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'An active workout already exists',
      workoutId,
    });
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('does not start a routine day the user does not own', async () => {
    client.query
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result());

    const response = await authenticated('post', '/api/workouts/start')
      .send({ routineDayId: dayId });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Routine day not found');
    expect(client.query.mock.calls[1][1]).toEqual([dayId, userId]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rejects an empty routine day', async () => {
    client.query
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result([{
        id: dayId,
        name: 'Push Day',
        day_number: 1,
        routine_id: '1958117f-e589-42d6-855c-3219158f6aff',
        routine_name: 'Muscle Building Routine',
      }]))
      .mockReturnValueOnce(result());

    const response = await authenticated('post', '/api/workouts/start')
      .send({ routineDayId: dayId });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('Routine day has no exercises');
  });

  it('starts a workout and snapshots its prescribed exercises', async () => {
    client.query
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result([{
        id: dayId,
        name: 'Push Day',
        day_number: 1,
        routine_id: '1958117f-e589-42d6-855c-3219158f6aff',
        routine_name: 'Muscle Building Routine',
      }]))
      .mockReturnValueOnce(result([{
        id: routineExerciseId,
        exercise_id: exerciseId,
        exercise_order: 1,
        sets: 3,
        rep_min: 8,
        rep_max: 12,
        target_rir: 2,
        rest_seconds: 90,
        notes: null,
      }]))
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result([{ id: workoutId }]))
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result());
    databaseMocks.query
      .mockReturnValueOnce(result([workoutRow()]))
      .mockReturnValueOnce(result([exerciseRow()]))
      .mockReturnValueOnce(result());

    const response = await authenticated('post', '/api/workouts/start')
      .send({ routineDayId: dayId });

    expect(response.status).toBe(201);
    expect(response.body.workout).toMatchObject({
      id: workoutId,
      name: 'Push Day',
      status: 'in_progress',
    });
    expect(response.body.workout.exercises[0]).toMatchObject({
      exerciseId,
      prescribedSets: 3,
      recommendation: { action: 'start' },
    });
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('validates logged-set values before querying the database', async () => {
    const response = await authenticated('post', `/api/workouts/${workoutId}/sets`)
      .send({ sessionExerciseId, setNumber: 1, reps: -1 });

    expect(response.status).toBe(400);
    expect(databaseMocks.query).not.toHaveBeenCalled();
  });

  it('does not log a set against another user or inactive workout', async () => {
    databaseMocks.query.mockReturnValueOnce(result());

    const response = await authenticated('post', `/api/workouts/${workoutId}/sets`)
      .send({ sessionExerciseId, setNumber: 1, weightKg: 80, reps: 10, rir: 2 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Active workout exercise not found');
    expect(databaseMocks.query.mock.calls[0][1]).toEqual([sessionExerciseId, workoutId, userId]);
  });

  it('logs a working set for an owned active workout', async () => {
    databaseMocks.query
      .mockReturnValueOnce(result([{ id: sessionExerciseId }]))
      .mockReturnValueOnce(result([{
        id: setId,
        workout_session_exercise_id: sessionExerciseId,
        set_number: 1,
        set_type: 'working',
        weight_kg: '80.00',
        reps: 10,
        rir: 2,
        rpe: null,
        is_completed: true,
        completed_at: '2026-06-23T12:10:00.000Z',
        notes: null,
      }]));

    const response = await authenticated('post', `/api/workouts/${workoutId}/sets`)
      .send({ sessionExerciseId, setNumber: 1, weightKg: 80, reps: 10, rir: 2 });

    expect(response.status).toBe(201);
    expect(response.body.set).toMatchObject({
      id: setId,
      sessionExerciseId,
      setNumber: 1,
      setType: 'working',
      reps: 10,
      isCompleted: true,
    });
  });

  it('does not complete a workout the user does not own', async () => {
    databaseMocks.query.mockReturnValueOnce(result());

    const response = await authenticated('post', `/api/workouts/${workoutId}/complete`).send({});

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Active workout not found');
    expect(databaseMocks.query.mock.calls[0][1]).toEqual(['completed', undefined, workoutId, userId]);
  });

  it('completes an owned active workout', async () => {
    databaseMocks.query
      .mockReturnValueOnce(result([{ id: workoutId }]))
      .mockReturnValueOnce(result([workoutRow('completed')]))
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result());

    const response = await authenticated('post', `/api/workouts/${workoutId}/complete`).send({});

    expect(response.status).toBe(200);
    expect(response.body.workout).toMatchObject({ id: workoutId, status: 'completed' });
  });

  it('does not delete a workout the user does not own', async () => {
    databaseMocks.query.mockReturnValueOnce(result());

    const response = await authenticated('delete', `/api/workouts/${workoutId}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Workout not found');
    expect(databaseMocks.query.mock.calls[0][1]).toEqual([workoutId, userId]);
  });

  it('deletes an owned workout', async () => {
    databaseMocks.query.mockReturnValueOnce(result([{ id: workoutId }]));

    const response = await authenticated('delete', `/api/workouts/${workoutId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Workout deleted', workoutId });
  });
});
