import { useEffect, useState } from 'react';
import { Workout, WorkoutHistoryItem } from '../api';
import { UnitPreference, formatWeight, fromKilograms } from '../units';

type SetDraft = {
  weightKg: string;
  reps: string;
  rir: string;
};

type WorkoutLoggerProps = {
  workout: Workout;
  unitPreference: UnitPreference;
  onLogSet: (
    sessionExerciseId: string,
    setNumber: number,
    draft: SetDraft
  ) => Promise<void>;
  onComplete: () => Promise<void>;
  onExit: () => void;
};

function draftKey(exerciseId: string, setNumber: number) {
  return `${exerciseId}:${setNumber}`;
}

export function WorkoutLogger({
  workout,
  onLogSet,
  onComplete,
  onExit,
  unitPreference,
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
            ? suggestedWeight == null ? '' : String(fromKilograms(suggestedWeight, unitPreference))
            : String(fromKilograms(logged.weightKg, unitPreference)),
          reps: logged ? String(logged.reps) : suggestedReps == null ? '' : String(suggestedReps),
          rir: logged?.rir == null
            ? exercise.targetRir == null ? '' : String(exercise.targetRir)
            : String(logged.rir),
        };
      }
    }

    setDrafts(nextDrafts);
  }, [workout, unitPreference]);

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

  async function finish() {
    setFinishing(true);
    try {
      await onComplete();
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
            onClick={onExit}
          >
            Exit
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={finishing}
            onClick={finish}
          >
            {finishing ? 'Finishing...' : 'Finish workout'}
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
              <span>{unitPreference}</span>
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
                        ? `${previous.weightKg == null ? '-' : fromKilograms(previous.weightKg, unitPreference)} x ${previous.reps}`
                        : '-'}
                    </small>
                  </span>
                  <input
                    aria-label={`${exercise.name} set ${setNumber} weight in ${unitPreference === 'kg' ? 'kilograms' : 'pounds'}`}
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

export function WorkoutHistory({
  workouts,
  onDelete,
  unitPreference,
}: {
  workouts: WorkoutHistoryItem[];
  onDelete: (workoutId: string) => Promise<void>;
  unitPreference: UnitPreference;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loggedWorkouts = workouts.filter((workout) => workout.completedSetCount > 0);
  if (loggedWorkouts.length === 0) return null;

  async function removeWorkout(workoutId: string) {
    setDeletingId(workoutId);
    try {
      await onDelete(workoutId);
      setConfirmingId(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="workout-history">
      <div>
        <p className="section-label">Recent training</p>
        <h2>Workout history</h2>
      </div>
      <div className="history-list">
        {loggedWorkouts.slice(0, 5).map((workout) => (
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
              <strong>{formatWeight(workout.totalVolumeKg, unitPreference, 0)}</strong>
              <span>Volume</span>
            </div>
            <span className={`history-status ${workout.status}`}>{workout.status}</span>
            <div className="history-delete-actions">
              {confirmingId === workout.id ? (
                <>
                  <button type="button" className="confirm-delete" aria-label={`Confirm deletion of ${workout.name} workout`} disabled={deletingId === workout.id} onClick={() => removeWorkout(workout.id)}>
                    {deletingId === workout.id ? 'Deleting...' : 'Confirm'}
                  </button>
                  <button type="button" aria-label={`Cancel deletion of ${workout.name} workout`} disabled={deletingId === workout.id} onClick={() => setConfirmingId(null)}>Cancel</button>
                </>
              ) : (
                <button type="button" className="delete-trigger" aria-label={`Delete ${workout.name} workout`} onClick={() => setConfirmingId(workout.id)}>Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
