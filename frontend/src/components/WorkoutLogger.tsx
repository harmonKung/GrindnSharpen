import { useEffect, useRef, useState } from 'react';
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
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [restTimerRequest, setRestTimerRequest] = useState<{
    exerciseId: string;
    exerciseName: string;
    restSeconds: number;
    signal: number;
  } | null>(null);
  const [restNotificationsEnabled, setRestNotificationsEnabled] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);

  useEffect(() => {
    setDrafts((current) => {
      const nextDrafts = { ...current };

      for (const exercise of workout.exercises) {
        const setCount = exercise.prescribedSets || 1;
        for (let setNumber = 1; setNumber <= setCount; setNumber++) {
          const key = draftKey(exercise.id, setNumber);
          if (nextDrafts[key]) continue;

          const logged = exercise.sets.find(
            (set) => set.setType === 'working' && set.setNumber === setNumber
          );
          const suggestedWeight = exercise.recommendation.weightKg;
          const suggestedReps = exercise.recommendation.reps;
          nextDrafts[key] = {
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

      return nextDrafts;
    });
  }, [workout, unitPreference]);

  useEffect(() => {
    if (!savedKey) return;
    const timeout = window.setTimeout(() => setSavedKey(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [savedKey]);

  useEffect(() => {
    if (!showHelp) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowHelp(false);
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [showHelp]);

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
      setSavedKey(key);
      const exercise = workout.exercises.find((item) => item.id === exerciseId);
      if (exercise) {
        setRestTimerRequest((current) => ({
          exerciseId,
          exerciseName: exercise.name,
          restSeconds: exercise.restSeconds || 90,
          signal: (current?.signal || 0) + 1,
        }));
      }
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleRestNotifications(enabled: boolean) {
    setNotificationError(null);
    if (!enabled) {
      setRestNotificationsEnabled(false);
      return;
    }

    if (typeof Notification === 'undefined') {
      setNotificationError('This browser does not support notifications.');
      return;
    }

    try {
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotificationError('Notification permission was not granted.');
        return;
      }
      setRestNotificationsEnabled(true);
    } catch {
      setNotificationError('Could not enable notifications. Check your browser settings and try again.');
    }
  }

  function notifyRestComplete() {
    if (!restNotificationsEnabled || typeof Notification === 'undefined') return;

    try {
      new Notification('Rest time is up', {
        body: `Ready for your next set of ${restTimerRequest?.exerciseName || 'your workout'}.`,
      });
    } catch {
      setNotificationError('Could not show a notification. Check your browser settings.');
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
          <p className="training-legend"><strong>RIR</strong> = reps in reserve, or how many reps you could still do after a set.</p>
        </div>
        <div className="workout-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setShowHelp(true)}
          >
            Help
          </button>
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

      {restTimerRequest && (
        <RestTimer
          key={restTimerRequest.exerciseId}
          exerciseName={restTimerRequest.exerciseName}
          defaultSeconds={restTimerRequest.restSeconds}
          startSignal={restTimerRequest.signal}
          notificationsEnabled={restNotificationsEnabled}
          onNotificationsChange={toggleRestNotifications}
          onComplete={notifyRestComplete}
          notificationError={notificationError}
        />
      )}

      {showHelp && (
        <div
          className="workout-help-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowHelp(false);
          }}
        >
          <section
            className="workout-help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workout-help-title"
          >
            <div className="workout-help-heading">
              <h2 id="workout-help-title">How to record your sets</h2>
              <button
                type="button"
                className="ghost-button"
                autoFocus
                onClick={() => setShowHelp(false)}
              >
                Close
              </button>
            </div>
            <ol>
              <li>Each row is one working set. The smaller number under the set number shows your last performance for reference.</li>
              <li>Enter the weight you lifted in your selected unit and the reps you completed. Reps are required; weight can be left blank if your not adding any weights.</li>
              <li>Enter your RIR (reps in reserve): how many more reps you could have done. RIR is optional.</li>
              <li>Press <strong>Log</strong> to save that set. Repeat for each set; you can edit the values and log again if needed.</li>
            </ol>
          </section>
        </div>
      )}

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
                    className={savedKey === key ? 'set-button saved' : 'set-button'}
                    disabled={!draft.reps || savingKey === key}
                    onClick={() => saveSet(exercise.id, setNumber)}
                  >
                    {savingKey === key ? 'Saving' : savedKey === key ? 'Saved' : 'Log'}
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

function RestTimer({
  exerciseName,
  defaultSeconds,
  startSignal,
  notificationsEnabled,
  onNotificationsChange,
  onComplete,
  notificationError,
}: {
  exerciseName: string;
  defaultSeconds: number;
  startSignal: number;
  notificationsEnabled: boolean;
  onNotificationsChange: (enabled: boolean) => void;
  onComplete: () => void;
  notificationError: string | null;
}) {
  const [duration, setDuration] = useState(String(defaultSeconds));
  const [remaining, setRemaining] = useState(defaultSeconds);
  const [running, setRunning] = useState(false);
  const endTime = useRef<number | null>(null);
  const seconds = Number(duration);
  const validDuration = duration.trim() !== '' && Number.isInteger(seconds) && seconds >= 5 && seconds <= 3600;
  const desiredDuration = useRef(defaultSeconds);
  desiredDuration.current = validDuration ? seconds : defaultSeconds;

  useEffect(() => {
    if (!startSignal) return;
    const nextDuration = desiredDuration.current;
    setRemaining(nextDuration);
    endTime.current = Date.now() + nextDuration * 1000;
    setRunning(true);
  }, [startSignal]);

  useEffect(() => {
    if (!running) return;

    const interval = window.setInterval(() => {
      const nextRemaining = Math.max(0, Math.ceil(((endTime.current || Date.now()) - Date.now()) / 1000));
      setRemaining(nextRemaining);
      if (nextRemaining === 0) {
        window.clearInterval(interval);
        setRunning(false);
        onComplete();
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [running, onComplete]);

  function updateDuration(value: string) {
    setDuration(value);
    const nextSeconds = Number(value);
    if (value.trim() && Number.isInteger(nextSeconds) && nextSeconds >= 5 && nextSeconds <= 3600) {
      setRemaining(nextSeconds);
    }
    setRunning(false);
    endTime.current = null;
  }

  function pause() {
    if (endTime.current !== null) {
      setRemaining(Math.max(0, Math.ceil((endTime.current - Date.now()) / 1000)));
    }
    setRunning(false);
  }

  function resume() {
    if (!validDuration || remaining <= 0) return;
    endTime.current = Date.now() + remaining * 1000;
    setRunning(true);
  }

  function reset() {
    setRunning(false);
    setRemaining(validDuration ? seconds : defaultSeconds);
    endTime.current = null;
  }

  const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
  const secondsDisplay = (remaining % 60).toString().padStart(2, '0');

  return (
    <section className="rest-timer" aria-label="Workout rest timer">
      <div className="rest-timer-display">
        <div>
          <p className="section-label">Rest timer</p>
          <strong aria-live="polite" aria-atomic="true">{minutes}:{secondsDisplay}</strong>
          <span>{running ? `Resting after ${exerciseName}` : `After ${exerciseName}`}</span>
        </div>
        <div className="rest-timer-controls">
          <label>
            Rest duration (seconds)
            <input
              type="number"
              min="5"
              max="3600"
              step="5"
              value={duration}
              onChange={(event) => updateDuration(event.target.value)}
            />
          </label>
          {running ? (
            <button type="button" className="ghost-button" onClick={pause}>Pause</button>
          ) : (
            <button type="button" className="ghost-button" disabled={!validDuration || remaining === 0} onClick={resume}>Resume</button>
          )}
          <button type="button" className="ghost-button" onClick={reset}>Reset</button>
        </div>
      </div>
      <label className="rest-notification-toggle">
        <input
          type="checkbox"
          checked={notificationsEnabled}
          onChange={(event) => onNotificationsChange(event.target.checked)}
        />
        Notify me when rest ends
      </label>
      {notificationError && <p className="rest-notification-error" role="status">{notificationError}</p>}
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
