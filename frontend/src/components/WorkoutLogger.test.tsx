import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { Workout, WorkoutHistoryItem } from '../api';
import { WorkoutHistory, WorkoutLogger } from './WorkoutLogger';

const workout: Workout = {
  id: 'workout-1',
  routineId: 'routine-1',
  routineDayId: 'day-1',
  routineName: 'Muscle Building Routine',
  dayNumber: 1,
  name: 'Push Day',
  status: 'in_progress',
  startedAt: '2026-06-24T12:00:00.000Z',
  completedAt: null,
  notes: null,
  exercises: [{
    id: 'session-exercise-1',
    exerciseId: 'exercise-1',
    name: 'Bench Press',
    primaryMuscle: 'chest',
    order: 1,
    prescribedSets: 1,
    prescribedRepMin: 8,
    prescribedRepMax: 12,
    targetRir: 2,
    restSeconds: 90,
    notes: null,
    sets: [],
    previousPerformance: {
      workoutId: 'previous-workout',
      completedAt: '2026-06-20T12:00:00.000Z',
      sets: [{ setNumber: 1, weightKg: 75, reps: 10, rir: 2 }],
    },
    recommendation: {
      action: 'add_reps',
      weightKg: 80,
      reps: 11,
      message: 'Keep the weight and aim for 11 reps.',
    },
  }],
};

describe('WorkoutLogger', () => {
  it('has no automated accessibility violations', async () => {
    const { container } = render(
      <WorkoutLogger
        workout={workout}
        unitPreference="kg"
        onLogSet={vi.fn()}
        onComplete={vi.fn()}
        onExit={vi.fn()}
      />
    );

    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
  });

  it('converts suggested and previous weights to the selected unit', async () => {
    render(
      <WorkoutLogger
        workout={workout}
        unitPreference="lb"
        onLogSet={vi.fn()}
        onComplete={vi.fn()}
        onExit={vi.fn()}
      />
    );

    const weightInput = screen.getByLabelText('Bench Press set 1 weight in pounds');
    await waitFor(() => expect(weightInput).toHaveValue(176.37));
    expect(screen.getByText('165.35 x 10')).toBeInTheDocument();
  });

  it('submits editable set values and exposes finish and exit actions', async () => {
    const user = userEvent.setup();
    const onLogSet = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const onExit = vi.fn();
    render(
      <WorkoutLogger
        workout={workout}
        unitPreference="kg"
        onLogSet={onLogSet}
        onComplete={onComplete}
        onExit={onExit}
      />
    );

    const repsInput = screen.getByLabelText('Bench Press set 1 reps');
    await waitFor(() => expect(repsInput).toHaveValue(11));
    await user.clear(repsInput);
    await user.type(repsInput, '12');
    await user.click(screen.getByRole('button', { name: 'Log' }));

    expect(onLogSet).toHaveBeenCalledWith('session-exercise-1', 1, {
      weightKg: '80',
      reps: '12',
      rir: '2',
    });

    await user.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Finish workout' }));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});

describe('WorkoutHistory', () => {
  const loggedWorkout: WorkoutHistoryItem = {
    id: 'logged-workout',
    name: 'Push Day',
    status: 'completed',
    routineId: 'routine-1',
    routineDayId: 'day-1',
    startedAt: '2026-06-24T12:00:00.000Z',
    completedAt: '2026-06-24T13:00:00.000Z',
    exerciseCount: 4,
    completedSetCount: 12,
    totalVolumeKg: 4000,
  };

  it('hides untouched workouts and requires confirmation before deletion', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkoutHistory
        workouts={[loggedWorkout, { ...loggedWorkout, id: 'untouched', name: 'Untouched', completedSetCount: 0 }]}
        unitPreference="kg"
        onDelete={onDelete}
      />
    );

    expect(screen.queryByText('Untouched')).not.toBeInTheDocument();
    expect(screen.getByText('4,000 kg')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete Push Day workout' }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm deletion of Push Day workout' }));
    expect(onDelete).toHaveBeenCalledWith('logged-workout');
  });
});
