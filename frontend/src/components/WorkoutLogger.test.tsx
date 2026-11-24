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
  it('preserves other set drafts after saving and allows the set to be logged again', async () => {
    const user = userEvent.setup();
    const onLogSet = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <WorkoutLogger
        workout={workout}
        unitPreference="kg"
        onLogSet={onLogSet}
        onComplete={vi.fn()}
        onExit={vi.fn()}
      />
    );

    const weightInput = screen.getByLabelText('Bench Press set 1 weight in kilograms');
    const repsInput = screen.getByLabelText('Bench Press set 1 reps');
    const rirInput = screen.getByLabelText('Bench Press set 1 reps in reserve');
    await waitFor(() => expect(repsInput).toHaveValue(11));
    await user.clear(weightInput);
    await user.type(weightInput, '85');
    await user.clear(repsInput);
    await user.type(repsInput, '10');
    await user.clear(rirInput);
    await user.type(rirInput, '1');
    await user.click(screen.getByRole('button', { name: 'Log' }));

    expect(screen.getByRole('button', { name: 'Saved' })).toBeEnabled();
    rerender(
      <WorkoutLogger
        workout={{
          ...workout,
          exercises: [{
            ...workout.exercises[0],
            sets: [{
              id: 'logged-set-1',
              setNumber: 1,
              setType: 'working',
              weightKg: 85,
              reps: 10,
              rir: 1,
              rpe: null,
              isCompleted: true,
              completedAt: '2026-06-24T12:30:00.000Z',
              notes: null,
            }],
          }],
        }}
        unitPreference="kg"
        onLogSet={onLogSet}
        onComplete={vi.fn()}
        onExit={vi.fn()}
      />
    );

    expect(weightInput).toHaveValue(85);
    expect(repsInput).toHaveValue(10);
    expect(rirInput).toHaveValue(1);
    await user.click(screen.getByRole('button', { name: 'Saved' }));
    expect(onLogSet).toHaveBeenCalledTimes(2);
  });

  it('clears the saved status after a short delay', async () => {
    const user = userEvent.setup();
    render(
      <WorkoutLogger
        workout={workout}
        unitPreference="kg"
        onLogSet={vi.fn().mockResolvedValue(undefined)}
        onComplete={vi.fn()}
        onExit={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByLabelText('Bench Press set 1 reps')).toHaveValue(11));
    await user.click(screen.getByRole('button', { name: 'Log' }));
    expect(await screen.findByRole('button', { name: 'Saved' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log' })).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

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

  it('shows the rest timer before sets and starts only when requested', async () => {
    const user = userEvent.setup();
    render(
      <WorkoutLogger
        workout={workout}
        unitPreference="kg"
        onLogSet={vi.fn().mockResolvedValue(undefined)}
        onComplete={vi.fn()}
        onExit={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Workout rest timer')).toBeInTheDocument();
    expect(screen.getByText('00:01:30')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText('Bench Press set 1 reps')).toHaveValue(11));
    await user.click(screen.getByRole('button', { name: 'Log' }));

    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();

    const hoursInput = screen.getByLabelText('Rest duration hours');
    const minutesInput = screen.getByLabelText('Rest duration minutes');
    await user.clear(hoursInput);
    await user.type(hoursInput, '1');
    expect(screen.getByText('01:01:30')).toBeInTheDocument();
    await user.clear(hoursInput);
    await user.type(hoursInput, '0');
    await user.clear(minutesInput);
    await user.type(minutesInput, '0');
    expect(screen.getByText('00:00:30')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Saved' }));
    expect(screen.getByText('00:00:30')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('counts down while the rest timer is running', async () => {
    const user = userEvent.setup();
    render(
      <WorkoutLogger
        workout={workout}
        unitPreference="kg"
        onLogSet={vi.fn().mockResolvedValue(undefined)}
        onComplete={vi.fn()}
        onExit={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Log' }));
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByRole('button', { name: 'Pause' });
    await waitFor(() => expect(screen.getByText('00:01:29')).toBeInTheDocument(), { timeout: 2000 });
  });

  it('opens and closes set-recording help', async () => {
    const user = userEvent.setup();
    render(
      <WorkoutLogger
        workout={workout}
        unitPreference="kg"
        onLogSet={vi.fn()}
        onComplete={vi.fn()}
        onExit={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('dialog', { name: 'How to record your sets' })).toBeInTheDocument();
    expect(screen.getByText(/Reps are required; weight can be left blank/)).toBeInTheDocument();
    expect(screen.getByText(/RIR \(reps in reserve\)/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Help' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
