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
const routineId = '3958117f-e589-42d6-855c-3219158f6aff';
const scheduledId = '4958117f-e589-42d6-855c-3219158f6aff';
const token = signAccessToken({ userId, email: 'test@example.com' });

function result(rows: Record<string, unknown>[] = []) {
  return Promise.resolve({ rows });
}

function authenticated(method: 'get' | 'post' | 'patch', path: string) {
  return request(app)[method](path).set('Authorization', `Bearer ${token}`);
}

describe('training calendar API', () => {
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

  it('requires authentication', async () => {
    const response = await request(app).get('/api/calendar');

    expect(response.status).toBe(401);
    expect(databaseMocks.query).not.toHaveBeenCalled();
  });

  it('marks past sessions missed and returns named upcoming sessions', async () => {
    databaseMocks.query
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result([{
        id: scheduledId,
        routine_id: routineId,
        routine_day_id: '5958117f-e589-42d6-855c-3219158f6aff',
        scheduled_date: '2026-06-20',
        status: 'missed',
        routine_name: 'Strength plan',
        routine_day_name: 'Upper body',
      }]));

    const response = await authenticated('get', '/api/calendar');

    expect(response.status).toBe(200);
    expect(response.body.workouts).toEqual([{
      id: scheduledId,
      routineId,
      routineDayId: '5958117f-e589-42d6-855c-3219158f6aff',
      routineName: 'Strength plan',
      routineDayName: 'Upper body',
      scheduledDate: '2026-06-20',
      status: 'missed',
    }]);
    expect(databaseMocks.query.mock.calls[0][0]).toContain("SET status = 'missed'");
  });

  it('rejects duplicate weekdays before opening a database connection', async () => {
    const response = await authenticated('post', '/api/calendar/schedule')
      .send({ routineId, weekdays: [1, 1] });

    expect(response.status).toBe(400);
    expect(databaseMocks.getClient).not.toHaveBeenCalled();
  });

  it('assigns routine days in order across the generated weekly schedule', async () => {
    client.query
      .mockReturnValueOnce(result([{ id: routineId, days_per_week: 2 }]))
      .mockReturnValueOnce(result([
        { id: 'day-one', name: 'Upper body' },
        { id: 'day-two', name: 'Lower body' },
      ]))
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result([
        { scheduled_date: '2026-06-24' },
        { scheduled_date: '2026-06-26' },
        { scheduled_date: '2026-07-01' },
        { scheduled_date: '2026-07-03' },
      ]))
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result())
      .mockReturnValueOnce(result());

    const response = await authenticated('post', '/api/calendar/schedule')
      .send({ routineId, weekdays: [3, 5] });

    expect(response.status).toBe(201);
    expect(response.body.scheduledCount).toBe(4);
    const inserts = client.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO scheduled_workouts')
    );
    expect(inserts.map(([, values]) => values[2])).toEqual([
      'day-one',
      'day-two',
      'day-one',
      'day-two',
    ]);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('moves an owned scheduled workout to the selected date', async () => {
    databaseMocks.query.mockReturnValueOnce(result([{
      id: scheduledId,
      routine_id: routineId,
      routine_day_id: '5958117f-e589-42d6-855c-3219158f6aff',
      scheduled_date: '2026-06-27',
      status: 'scheduled',
    }]));

    const response = await authenticated('patch', `/api/calendar/${scheduledId}`)
      .send({ scheduledDate: '2026-06-27' });

    expect(response.status).toBe(200);
    expect(response.body.workout).toMatchObject({
      id: scheduledId,
      scheduledDate: '2026-06-27',
      status: 'scheduled',
    });
    expect(databaseMocks.query.mock.calls[0][1]).toEqual([
      '2026-06-27',
      scheduledId,
      userId,
    ]);
  });
});
