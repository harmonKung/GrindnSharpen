import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Routine, ScheduledWorkout } from '../api';
import { TrainingCalendar } from './TrainingCalendar';

const calendarApi = vi.hoisted(() => ({
  createTrainingSchedule: vi.fn(),
  getTrainingCalendar: vi.fn(),
  moveScheduledWorkout: vi.fn(),
}));

vi.mock('../api', () => calendarApi);

const routine: Routine = {
  id: 'routine-1',
  name: 'Strength plan',
  goal: 'strength',
  experienceLevel: 'beginner',
  daysPerWeek: 2,
  sessionDurationMin: 60,
  status: 'active',
  generationSource: 'rules',
  createdAt: '2026-06-01T12:00:00.000Z',
  days: [],
};

const workouts: ScheduledWorkout[] = [
  {
    id: 'scheduled-1',
    routineId: 'routine-1',
    routineDayId: 'day-1',
    routineName: 'Strength plan',
    routineDayName: 'Upper body',
    scheduledDate: '2026-07-01',
    status: 'scheduled',
  },
  {
    id: 'scheduled-2',
    routineId: 'routine-1',
    routineDayId: 'day-2',
    routineName: 'Strength plan',
    routineDayName: 'Lower body',
    scheduledDate: '2026-06-20',
    status: 'missed',
  },
];

describe('TrainingCalendar', () => {
  beforeEach(() => {
    calendarApi.createTrainingSchedule.mockReset().mockResolvedValue({
      message: 'Training schedule created',
      scheduledCount: 8,
    });
    calendarApi.getTrainingCalendar.mockReset().mockResolvedValue({ workouts });
    calendarApi.moveScheduledWorkout.mockReset().mockResolvedValue({ workout: workouts[1] });
  });

  it('lets the user build a recurring schedule from selected weekdays', async () => {
    const user = userEvent.setup();
    render(
      <TrainingCalendar
        accessToken="token"
        routine={routine}
        onStartWorkout={vi.fn()}
      />
    );

    await screen.findByText('Upper body · Strength plan');
    await user.click(screen.getByRole('checkbox', { name: 'Mon' }));
    await user.click(screen.getByRole('checkbox', { name: 'Sun' }));
    await user.click(screen.getByRole('button', { name: 'Save 4-week schedule' }));

    await waitFor(() => expect(calendarApi.createTrainingSchedule).toHaveBeenCalledWith(
      'token',
      'routine-1',
      [0, 3]
    ));
    expect(await screen.findByRole('status')).toHaveTextContent('Schedule saved with 8 sessions.');
  });

  it('reschedules missed workouts and offers upcoming workout starts', async () => {
    const user = userEvent.setup();
    const onStartWorkout = vi.fn();
    render(
      <TrainingCalendar
        accessToken="token"
        routine={routine}
        onStartWorkout={onStartWorkout}
      />
    );

    await screen.findByText('Missed Saturday, Jun 20');
    const dateInput = screen.getByLabelText('New date for Lower body');
    await user.clear(dateInput);
    await user.type(dateInput, '2026-07-04');
    await user.click(screen.getByRole('button', { name: 'Reschedule' }));

    await waitFor(() => expect(calendarApi.moveScheduledWorkout).toHaveBeenCalledWith(
      'token',
      'scheduled-2',
      '2026-07-04'
    ));
    await user.click(screen.getAllByRole('button', { name: 'Start workout' })[0]);
    expect(onStartWorkout).toHaveBeenCalledWith('day-1');
  });
});
