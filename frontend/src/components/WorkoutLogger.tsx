import { useEffect, useState } from 'react';
import { Workout, WorkoutHistoryItem } from '../api';

type SetDraft = {
  weightKg: string;
  reps: string;
  rir: string;
};

type WorkoutLoggerProps = {
  workout: Workout;
  onLogSet: (
    sessionExerciseId: string,
    setNumber: number,
    draft: SetDraft
  ) => Promise<void>;
  onComplete: () => Promise<void>;
  onCancel: () => Promise<void>;
};

function draftKey(exerciseId: string, setNumber: number) {
  return `${exerciseId}:${setNumber}`;
}

export function WorkoutLogger({
  workout,
  onLogSet,
  onComplete,
  onCancel,
}: WorkoutLoggerProps) {
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    const nextDrafts: Record<string, SetDraft> = {};

    for (const exercise of workout.exercises) {
      const setCount = exercise.prescribedSets || 1;
      for (let setNumber = 1; setNumber <= setCount; setNumber++) {
        const logged = exercise.sets.find(
          (set) => set.setType === 'working' && set.setNumber === setNumber
        );
        const suggestedWeight = exercise.recommendation.weightKg;
        const suggestedReps = exercise.recommendation.reps;
        nextDrafts[draftKey(exercise.id, setNumber)] = {
          weightKg: logged?.weightKg == null
            ? suggestedWeight == null ? '' : String(suggestedWeight)
            : String(logged.weightKg),
          reps: logged ? String(logged.reps) : suggestedReps == null ? '' : String(suggestedReps),
          rir: logged?.rir == null
            ? exercise.targetRir == null ? '' : String(exercise.targetRir)
            : String(logged.rir),
        };
      }
    }

    setDrafts(nextDrafts);
  }, [workout]);

  function updateDraft(key: string, field: keyof SetDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
  }

  async function saveSet(exerciseId: string, setNumber: number) {
    const key = draftKey(exerciseId, setNumber);
    const draft = drafts[key];
    if (!draft?.reps) return;

    setSavingKey(key);
    try {
      await onLogSet(exerciseId, setNumber, draft);
    } finally {
      setSavingKey(null);
    }
  }

  async function finish(action: 'complete' | 'cancel') {
    setFinishing(true);
    try {
      if (action === 'complete') await onComplete();
      else await onCancel();
    } finally {
      setFinishing(false);
    }
  }

  const loggedCount = workout.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.isCompleted).length,
    0
  );
  const prescribedCount = workout.exercises.reduce(
    (total, exercise) => total + (exercise.prescribedSets || 0),
    0
  );

  return (
    <section className="workout-logger">
      <div className="workout-header">
        <div>
          <p className="section-label">Workout in progress</p>
          <h2>{workout.name}</h2>
          <p>{loggedCount} of {prescribedCount} working sets logged</p>
        </div>
        <div className="workout-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={finishing}
            onClick={() => finish('cancel')}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={finishing}
            onClick={() => finish('complete')}
          >
            {finishing ? 'Finishing...' : 'Complete workout'}
          </button>
        </div>
      </div>

      <div className="workout-exercises">
        {workout.exercises.map((exercise) => (
          <section className="workout-exercise" key={exercise.id}>
            <div className="workout-exercise-heading">
              <div>
                <span>{exercise.order}</span>
                <div>
                  <h3>{exercise.name}</h3>
                  <p>{exercise.primaryMuscle}</p>
                </div>
              </div>
              <p>
                {exercise.prescribedSets} x {exercise.prescribedRepMin}-{exercise.prescribedRepMax}
                {' '}at {exercise.targetRir} RIR
              </p>
            </div>

            <div className={`progression-cue ${exercise.recommendation.action}`}>
              <strong>{exercise.previousPerformance ? 'Next target' : 'First session'}</strong>
              <span>{exercise.recommendation.message}</span>
            </div>

            <div className="set-table-heading" aria-hidden="true">
              <span>Set / last</span>
              <span>kg</span>
              <span>Reps</span>
              <span>RIR</span>
              <span>Status</span>
            </div>

            {Array.from({ length: exercise.prescribedSets || 1 }, (_, index) => {
              const setNumber = index + 1;
              const key = draftKey(exercise.id, setNumber);
              const draft = drafts[key] || { weightKg: '', reps: '', rir: '' };
              const logged = exercise.sets.find(
                (set) => set.setType === 'working' && set.setNumber === setNumber
              );
              const previous = exercise.previousPerformance?.sets.find(
                (set) => set.setNumber === setNumber
              );

              return (
                <div className="set-row" key={key}>
                  <span className="set-index">
                    <strong>{setNumber}</strong>
                    <small>
                      {previous
                        ? `${previous.weightKg ?? '-'} x ${previous.reps}`
                        : '-'}
                    </small>
                  </span>
                  <input
                    aria-label={`${exercise.name} set ${setNumber} weight in kilograms`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    value={draft.weightKg}
                    onChange={(event) => updateDraft(key, 'weightKg', event.target.value)}
                  />
                  <input
                    aria-label={`${exercise.name} set ${setNumber} reps`}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="1000"
                    value={draft.reps}
                    onChange={(event) => updateDraft(key, 'reps', event.target.value)}
                  />
                  <input
                    aria-label={`${exercise.name} set ${setNumber} reps in reserve`}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="10"
                    value={draft.rir}
                    onChange={(event) => updateDraft(key, 'rir', event.target.value)}
                  />
                  <button
                    type="button"
                    className={logged ? 'set-button saved' : 'set-button'}
                    disabled={!draft.reps || savingKey === key}
                    onClick={() => saveSet(exercise.id, setNumber)}
                  >
                    {savingKey === key ? 'Saving' : logged ? 'Saved' : 'Log'}
                  </button>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </section>
  );
}

export function WorkoutHistory({ workouts }: { workouts: WorkoutHistoryItem[] }) {
  if (workouts.length === 0) return null;

  return (
    <section className="workout-history">
      <div>
        <p className="section-label">Recent training</p>
        <h2>Workout history</h2>
      </div>
      <div className="history-list">
        {workouts.slice(0, 5).map((workout) => (
          <div className="history-row" key={workout.id}>
            <div>
              <strong>{workout.name}</strong>
              <span>{new Date(workout.startedAt).toLocaleDateString()}</span>
            </div>
            <div>
              <strong>{workout.completedSetCount}</strong>
              <span>Sets</span>
            </div>
            <div>
              <strong>{Math.round(Number(workout.totalVolumeKg)).toLocaleString()} kg</strong>
              <span>Volume</span>
            </div>
            <span className={`history-status ${workout.status}`}>{workout.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
