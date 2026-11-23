import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ExerciseHistory, ProgressSummary, deleteBodyWeight, deleteDietEntry, getExerciseHistory, getProgressSummary, logBodyWeight, logDietEntry } from '../api';
import { UnitPreference, formatWeight, fromKilograms, toKilograms } from '../units';

type Props = {
  accessToken: string;
  currentWeight: string | number | null | undefined;
  unitPreference: UnitPreference;
  onWeightLogged: (weightKg: number | null) => void;
};

type Point = { label: string; value: number; display: string };

function formatChartDate(value: string) {
  const dateOnly = value.slice(0, 10);
  return new Date(`${dateOnly}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function TrendBars({ points, emptyText }: { points: Point[]; emptyText: string }) {
  if (!points.length) return <p className="progress-empty">{emptyText}</p>;
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const range = Math.max(Math.max(...values) - minimum, Math.max(...values) * 0.04, 1);

  return (
    <div className="trend-chart" role="img" aria-label={points.map((point) => `${point.label}: ${point.display}`).join(', ')}>
      {points.map((point, index) => (
        <div className="trend-column" key={`${point.label}-${index}`}>
          <span>{point.display}</span>
          <i style={{ height: `${Math.min(28 + ((point.value - minimum) / range) * 72, 100)}%` }} />
          <small>{point.label}</small>
        </div>
      ))}
    </div>
  );
}

export function ProgressDashboard({ accessToken, currentWeight, unitPreference, onWeightLogged }: Props) {
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [history, setHistory] = useState<ExerciseHistory | null>(null);
  const [exerciseId, setExerciseId] = useState('');
  const [weight, setWeight] = useState(currentWeight == null ? '' : String(fromKilograms(currentWeight, unitPreference)));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dietDate, setDietDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mealType, setMealType] = useState<ProgressSummary['dietEntries'][number]['mealType']>('breakfast');
  const [description, setDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingDiet, setSavingDiet] = useState(false);
  const [confirmingWeightId, setConfirmingWeightId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingDietId, setConfirmingDietId] = useState<string | null>(null);
  const [deletingDietId, setDeletingDietId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    const next = await getProgressSummary(accessToken);
    setSummary(next);
    setExerciseId((current) => current || next.trackedExercises[0]?.id || '');
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : 'Could not load progress'));
  }, [accessToken]);

  useEffect(() => {
    setWeight(currentWeight == null ? '' : String(fromKilograms(currentWeight, unitPreference)));
  }, [currentWeight, unitPreference]);

  useEffect(() => {
    if (!exerciseId) return setHistory(null);
    getExerciseHistory(accessToken, exerciseId, 8)
      .then(setHistory)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load exercise history'));
  }, [accessToken, exerciseId]);

  const weightPoints = useMemo<Point[]>(() => [...(summary?.bodyWeight ?? [])].reverse().slice(-10).map((entry) => ({
    label: formatChartDate(entry.recordedOn),
    value: Number(fromKilograms(entry.weightKg, unitPreference)),
    display: formatWeight(entry.weightKg, unitPreference),
  })), [summary, unitPreference]);

  const strengthPoints = useMemo<Point[]>(() => [...(history?.history ?? [])].reverse().map((session) => {
    const best = Math.max(...session.sets.map((set) => (set.weightKg ?? 0) * (1 + set.reps / 30)));
    return {
      label: new Date(session.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: Number(fromKilograms(best, unitPreference)),
      display: formatWeight(best, unitPreference, 0),
    };
  }), [history, unitPreference]);

  async function submitWeight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const weightKg = toKilograms(weight, unitPreference);
    if (!weightKg) return;
    setSaving(true);
    setError('');
    try {
      await logBodyWeight(accessToken, { weightKg, recordedOn: date });
      onWeightLogged(weightKg);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save weight');
    } finally {
      setSaving(false);
    }
  }

  async function submitDietEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingDiet(true);
    setError('');
    try {
      await logDietEntry(accessToken, {
        mealType,
        description: description.trim(),
        ...(calories === '' ? {} : { calories: Number(calories) }),
        recordedOn: dietDate,
      });
      setDescription('');
      setCalories('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save diet entry');
    } finally {
      setSavingDiet(false);
    }
  }

  async function removeDietEntry(entry: ProgressSummary['dietEntries'][number]) {
    setDeletingDietId(entry.id);
    setError('');
    try {
      await deleteDietEntry(accessToken, entry.id);
      await refresh();
      setConfirmingDietId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete diet entry');
    } finally {
      setDeletingDietId(null);
    }
  }

  async function removeWeight(entry: ProgressSummary['bodyWeight'][number]) {
    setDeletingId(entry.id);
    setError('');
    try {
      const result = await deleteBodyWeight(accessToken, entry.id);
      onWeightLogged(result.latestWeightKg);
      setWeight(result.latestWeightKg == null ? '' : String(fromKilograms(result.latestWeightKg, unitPreference)));
      await refresh();
      setConfirmingWeightId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete weight');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="progress-dashboard">
      <div className="progress-heading">
        <div><p className="section-label">Health &amp; training</p><h2>Your progress</h2></div>
        {error && <p className="progress-error" role="alert">{error}</p>}
      </div>
      <div className="progress-metrics">
        <div><strong>{summary?.weekly.workouts ?? 0}</strong><span>Workouts this week</span></div>
        <div><strong>{summary?.weekly.sets ?? 0}</strong><span>Working sets</span></div>
        <div><strong>{formatWeight(summary?.weekly.volumeKg ?? 0, unitPreference, 0)}</strong><span>Training volume</span></div>
      </div>
      {summary?.deload && summary.deload.status !== 'none' && (
        <section className={`deload-alert ${summary.deload.status}`} role="status">
          <div>
            <p className="section-label">Training readiness</p>
            <h3>{summary.deload.status === 'needed' ? 'Consider a deload' : 'Watch your recovery'}</h3>
          </div>
          <p>{summary.deload.reason}</p>
          {summary.deload.status === 'needed' && (
            <p className="deload-advice">
              Reduce volume or load for about one week, keep movement quality high, and aim for 3-4 RIR.
            </p>
          )}
        </section>
      )}
      <div className="progress-grid">
        <section className="progress-panel">
          <div className="progress-panel-heading"><div><h3>Body weight</h3><p>Daily check-ins</p></div></div>
          <form className="weight-checkin" onSubmit={submitWeight}>
            <label>Weight {unitPreference}<input type="number" min={unitPreference === 'lb' ? 44 : 20} max={unitPreference === 'lb' ? 1102 : 500} step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} required /></label>
            <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
            <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : 'Log weight'}</button>
          </form>
          <TrendBars points={weightPoints} emptyText="Log your first weight to begin the trend." />
          {!!summary?.bodyWeight.length && (
            <div className="weight-log-list">
              {summary.bodyWeight.map((entry) => (
                <div className="weight-log-row" key={entry.id}>
                  <span>{formatChartDate(entry.recordedOn)}</span>
                  <strong>{formatWeight(entry.weightKg, unitPreference)}</strong>
                  <div className="weight-delete-actions">
                    {confirmingWeightId === entry.id ? (
                      <>
                        <button type="button" className="confirm-delete" aria-label={`Confirm deletion of weight entry from ${formatChartDate(entry.recordedOn)}`} disabled={deletingId === entry.id} onClick={() => removeWeight(entry)}>
                          {deletingId === entry.id ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button type="button" aria-label={`Cancel deletion of weight entry from ${formatChartDate(entry.recordedOn)}`} disabled={deletingId === entry.id} onClick={() => setConfirmingWeightId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" className="delete-trigger" aria-label={`Delete weight entry from ${formatChartDate(entry.recordedOn)}`} onClick={() => setConfirmingWeightId(entry.id)}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="progress-panel">
          <div className="progress-panel-heading"><div><h3>Diet</h3><p>Keep a simple meal log</p></div></div>
          <form className="diet-checkin" onSubmit={submitDietEntry}>
            <label>
              Meal
              <select value={mealType} onChange={(event) => setMealType(event.target.value as ProgressSummary['dietEntries'][number]['mealType'])}>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
            </label>
            <label>
              Date
              <input type="date" value={dietDate} onChange={(event) => setDietDate(event.target.value)} required />
            </label>
            <label className="diet-description">
              Food / meal
              <input type="text" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} required />
            </label>
            <label>
              Calories (optional)
              <input type="number" min="0" max="10000" step="1" value={calories} onChange={(event) => setCalories(event.target.value)} />
            </label>
            <button className="primary-button" disabled={savingDiet}>{savingDiet ? 'Saving...' : 'Log meal'}</button>
          </form>
          <div className="diet-log-list">
            {summary?.dietEntries?.length ? summary.dietEntries.map((entry) => (
              <div className="diet-log-row" key={entry.id}>
                <div className="diet-log-details">
                  <strong>{entry.mealType[0].toUpperCase() + entry.mealType.slice(1)}</strong>
                  <span>{formatChartDate(entry.recordedOn)} · {entry.description}</span>
                </div>
                {entry.calories !== null && <span className="diet-calories">{entry.calories} cal</span>}
                <div className="weight-delete-actions">
                  {confirmingDietId === entry.id ? (
                    <>
                      <button type="button" className="confirm-delete" aria-label={`Confirm deletion of ${entry.mealType} entry`} disabled={deletingDietId === entry.id} onClick={() => removeDietEntry(entry)}>
                        {deletingDietId === entry.id ? 'Deleting...' : 'Confirm'}
                      </button>
                      <button type="button" aria-label={`Cancel deletion of ${entry.mealType} entry`} disabled={deletingDietId === entry.id} onClick={() => setConfirmingDietId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className="delete-trigger" aria-label={`Delete ${entry.mealType} entry`} onClick={() => setConfirmingDietId(entry.id)}>Delete</button>
                  )}
                </div>
              </div>
            )) : <p className="progress-empty">Your meal log will appear here.</p>}
          </div>
        </section>
        <section className="progress-panel">
          <div className="progress-panel-heading">
            <div><h3>Strength trend</h3><p>Estimated one-rep max</p></div>
            <select aria-label="Exercise to chart" value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>
              {summary?.trackedExercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
            </select>
          </div>
          <TrendBars points={strengthPoints} emptyText="Complete workouts to build an exercise trend." />
          {history && <p className="progress-recommendation"><strong>Next:</strong> {history.recommendation.message}</p>}
        </section>
      </div>
      {!!summary?.personalRecords.length && (
        <section className="personal-records">
          <div className="records-heading">
            <div><p className="section-label">Best lifts</p><h3>Personal records</h3></div>
            <p><strong>e1RM</strong> = estimated one-rep maximum</p>
          </div>
          <div className="record-list">{summary.personalRecords.slice(0, 5).map((record) => (
            <div className="record-row" key={record.exerciseId}>
              <strong>{record.name}</strong>
              <span>{formatWeight(record.weightKg, unitPreference)} x {record.reps}</span>
              <b>{formatWeight(record.estimatedOneRepMax, unitPreference, 0)} e1RM</b>
            </div>
          ))}</div>
        </section>
      )}
    </section>
  );
}
