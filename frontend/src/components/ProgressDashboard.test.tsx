import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getProgressSummary: vi.fn(),
  getExerciseHistory: vi.fn(),
  logBodyWeight: vi.fn(),
  deleteBodyWeight: vi.fn(),
}));

vi.mock('../api', () => apiMocks);

import { ProgressDashboard } from './ProgressDashboard';

const summary = {
  weekly: { workouts: 3, sets: 24, volumeKg: 8000 },
  bodyWeight: [{
    id: 'weight-1',
    weightKg: 82,
    recordedOn: '2026-06-24',
    notes: null,
  }],
  personalRecords: [{
    exerciseId: 'exercise-1',
    name: 'Bench Press',
    weightKg: 80,
    reps: 10,
    estimatedOneRepMax: 106.7,
    completedAt: '2026-06-23T12:00:00.000Z',
  }],
  trackedExercises: [{
    id: 'exercise-1',
    name: 'Bench Press',
    primaryMuscle: 'chest',
    lastTrainedAt: '2026-06-23T12:00:00.000Z',
  }],
};

const exerciseHistory = {
  exercise: { id: 'exercise-1', name: 'Bench Press', primaryMuscle: 'chest' },
  history: [],
  recommendation: {
    action: 'add_reps',
    weightKg: 80,
    reps: 11,
    message: 'Keep the weight and aim for 11 reps.',
  },
};

describe('ProgressDashboard', () => {
  beforeEach(() => {
    apiMocks.getProgressSummary.mockReset().mockResolvedValue(summary);
    apiMocks.getExerciseHistory.mockReset().mockResolvedValue(exerciseHistory);
    apiMocks.logBodyWeight.mockReset().mockResolvedValue({ entry: summary.bodyWeight[0] });
    apiMocks.deleteBodyWeight.mockReset().mockResolvedValue({
      message: 'Weight entry deleted',
      latestWeightKg: 81,
    });
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(
      <ProgressDashboard
        accessToken="token"
        currentWeight={82}
        unitPreference="kg"
        onWeightLogged={vi.fn()}
      />
    );

    await screen.findByText('Personal records');
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
  });

  it('renders stored kilogram data in the selected pound unit', async () => {
    render(
      <ProgressDashboard
        accessToken="token"
        currentWeight={82}
        unitPreference="lb"
        onWeightLogged={vi.fn()}
      />
    );

    const input = await screen.findByLabelText('Weight lb');
    expect(input).toHaveValue(180.78);
    expect(await screen.findAllByText('180.8 lb')).toHaveLength(2);
    expect(screen.getByText('17,637 lb')).toBeInTheDocument();
  });

  it('converts a pound check-in to kilograms before saving', async () => {
    const user = userEvent.setup();
    const onWeightLogged = vi.fn();
    render(
      <ProgressDashboard
        accessToken="token"
        currentWeight={82}
        unitPreference="lb"
        onWeightLogged={onWeightLogged}
      />
    );

    const input = await screen.findByLabelText('Weight lb');
    await user.clear(input);
    await user.type(input, '180');
    await user.click(screen.getByRole('button', { name: 'Log weight' }));

    await waitFor(() => expect(apiMocks.logBodyWeight).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ weightKg: 81.65 })
    ));
    expect(onWeightLogged).toHaveBeenCalledWith(81.65);
  });

  it('requires confirmation before deleting a weight entry', async () => {
    const user = userEvent.setup();
    const onWeightLogged = vi.fn();
    render(
      <ProgressDashboard
        accessToken="token"
        currentWeight={82}
        unitPreference="kg"
        onWeightLogged={onWeightLogged}
      />
    );

    await user.click(await screen.findByRole('button', { name: /Delete weight entry/ }));
    expect(apiMocks.deleteBodyWeight).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Confirm deletion of weight entry/ }));

    await waitFor(() => expect(apiMocks.deleteBodyWeight).toHaveBeenCalledWith('token', 'weight-1'));
    expect(onWeightLogged).toHaveBeenCalledWith(81);
  });
});
