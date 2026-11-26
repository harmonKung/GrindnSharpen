import { useEffect, useState } from 'react';
import {
  Routine,
  ScheduledWorkout,
  createTrainingSchedule,
  getTrainingCalendar,
  moveScheduledWorkout,
} from '../api';

type Props = {
  accessToken: string;
  routine: Routine | null;
  preferredDays?: string[] | null;
  onStartWorkout: (routineDayId: string) => void;
};

const weekdays = [
  { value: 0, name: 'Sunday', shortName: 'Sun' },
  { value: 1, name: 'Monday', shortName: 'Mon' },
  { value: 2, name: 'Tuesday', shortName: 'Tue' },
  { value: 3, name: 'Wednesday', shortName: 'Wed' },
  { value: 4, name: 'Thursday', shortName: 'Thu' },
  { value: 5, name: 'Friday', shortName: 'Fri' },
  { value: 6, name: 'Saturday', shortName: 'Sat' },
];

const defaultWeekOrder = [1, 3, 5, 6, 0, 2, 4];

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return localDateString(date);
}

function formatScheduledDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function initialWeekdays(routine: Routine, preferredDays?: string[] | null) {
  const preferred = (preferredDays ?? [])
    .map((day) => weekdays.find((weekday) => weekday.name.toLowerCase() === day.toLowerCase())?.value)
    .filter((day): day is number => day !== undefined);
  if (preferred.length === routine.daysPerWeek) return preferred.sort((a, b) => a - b);
  return defaultWeekOrder.slice(0, routine.daysPerWeek).sort((a, b) => a - b);
}

export function TrainingCalendar({ accessToken, routine, preferredDays, onStartWorkout }: Props) {
  const [workouts, setWorkouts] = useState<ScheduledWorkout[]>([]);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [moveDates, setMoveDates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refreshCalendar() {
    const response = await getTrainingCalendar(accessToken);
    setWorkouts(response.workouts);
  }

  useEffect(() => {
    setSelectedWeekdays(routine ? initialWeekdays(routine, preferredDays) : []);
  }, [routine?.id, routine?.daysPerWeek, preferredDays]);

  useEffect(() => {
    setLoading(true);
    setError('');
    getTrainingCalendar(accessToken)
      .then((response) => setWorkouts(response.workouts))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load training calendar'))
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function saveSchedule() {
    if (!routine) return;
    setSavingSchedule(true);
    setError('');
    setMessage('');
    try {
      const result = await createTrainingSchedule(accessToken, routine.id, selectedWeekdays);
      await refreshCalendar();
      setMessage(`Schedule saved with ${result.scheduledCount} sessions.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save schedule');
    } finally {
      setSavingSchedule(false);
    }
  }

  async function moveWorkout(workout: ScheduledWorkout) {
    const scheduledDate = moveDates[workout.id] ?? tomorrowDate();
    setMovingId(workout.id);
    setError('');
    setMessage('');
    try {
      await moveScheduledWorkout(accessToken, workout.id, scheduledDate);
      await refreshCalendar();
      setMessage(`${workout.routineDayName} moved to ${formatScheduledDate(scheduledDate)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move workout');
    } finally {
      setMovingId(null);
    }
  }

  function toggleWeekday(value: number) {
    setSelectedWeekdays((current) => current.includes(value)
      ? current.filter((day) => day !== value)
      : [...current, value].sort((a, b) => a - b));
  }

  const missedWorkouts = workouts.filter((workout) => workout.status === 'missed');
  const upcomingWorkouts = workouts.filter((workout) => workout.status === 'scheduled');

  return (
    <section className="training-calendar" aria-labelledby="training-calendar-title">
      <div className="training-calendar-heading">
        <div>
          <p className="section-label">Make it a habit</p>
          <h2 id="training-calendar-title">Training calendar</h2>
        </div>
        {loading && <span className="calendar-loading" role="status">Loading...</span>}
      </div>

      {routine ? (
        <div className="calendar-schedule-setup">
          <div>
            <h3>Choose your training days</h3>
            <p>We’ll place each routine day in order and repeat the plan for four weeks.</p>
          </div>
          <fieldset className="calendar-weekday-options">
            <legend>Pick {routine.daysPerWeek} days each week</legend>
            {weekdays.map((weekday) => (
              <label key={weekday.value} className={selectedWeekdays.includes(weekday.value) ? 'selected' : ''}>
                <input
                  type="checkbox"
                  checked={selectedWeekdays.includes(weekday.value)}
                  onChange={() => toggleWeekday(weekday.value)}
                />
                <span>{weekday.shortName}</span>
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="primary-button"
            disabled={savingSchedule || selectedWeekdays.length !== routine.daysPerWeek}
            onClick={saveSchedule}
          >
            {savingSchedule ? 'Saving...' : 'Save 4-week schedule'}
          </button>
        </div>
      ) : (
        <p className="calendar-empty">Generate a routine to schedule your training days.</p>
      )}

      <div className="calendar-workout-groups">
        <section aria-labelledby="calendar-upcoming-title">
          <div className="calendar-list-heading">
            <h3 id="calendar-upcoming-title">Upcoming workouts</h3>
            <span>{upcomingWorkouts.length}</span>
          </div>
          {upcomingWorkouts.length ? (
            <ul className="calendar-workout-list">
              {upcomingWorkouts.map((workout) => (
                <li key={workout.id} className="calendar-workout">
                  <div className="calendar-workout-date">
                    <strong>{formatScheduledDate(workout.scheduledDate)}</strong>
                    <span>{workout.routineDayName} · {workout.routineName}</span>
                  </div>
                  <div className="calendar-workout-actions">
                    <label className="visually-hidden" htmlFor={`move-date-${workout.id}`}>New date for {workout.routineDayName}</label>
                    <input
                      id={`move-date-${workout.id}`}
                      type="date"
                      min={localDateString(new Date())}
                      value={moveDates[workout.id] ?? tomorrowDate()}
                      onChange={(event) => setMoveDates((current) => ({ ...current, [workout.id]: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="calendar-move-button"
                      disabled={movingId === workout.id || !(moveDates[workout.id] ?? tomorrowDate())}
                      onClick={() => moveWorkout(workout)}
                    >
                      {movingId === workout.id ? 'Moving...' : 'Move'}
                    </button>
                    <button type="button" className="secondary-button" onClick={() => onStartWorkout(workout.routineDayId)}>
                      Start workout
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="calendar-empty">No upcoming workouts scheduled.</p>}
        </section>

        <section aria-labelledby="calendar-missed-title">
          <div className="calendar-list-heading">
            <h3 id="calendar-missed-title">Missed sessions</h3>
            <span>{missedWorkouts.length}</span>
          </div>
          {missedWorkouts.length ? (
            <ul className="calendar-workout-list">
              {missedWorkouts.map((workout) => (
                <li key={workout.id} className="calendar-workout missed">
                  <div className="calendar-workout-date">
                    <strong>{workout.routineDayName}</strong>
                    <span>Missed {formatScheduledDate(workout.scheduledDate)}</span>
                  </div>
                  <div className="calendar-workout-actions">
                    <label className="visually-hidden" htmlFor={`move-date-${workout.id}`}>New date for {workout.routineDayName}</label>
                    <input
                      id={`move-date-${workout.id}`}
                      type="date"
                      min={localDateString(new Date())}
                      value={moveDates[workout.id] ?? tomorrowDate()}
                      onChange={(event) => setMoveDates((current) => ({ ...current, [workout.id]: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="calendar-move-button"
                      disabled={movingId === workout.id || !(moveDates[workout.id] ?? tomorrowDate())}
                      onClick={() => moveWorkout(workout)}
                    >
                      {movingId === workout.id ? 'Moving...' : 'Reschedule'}
                    </button>
                    <button type="button" className="secondary-button" onClick={() => onStartWorkout(workout.routineDayId)}>
                      Start now
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="calendar-empty">You’re all caught up.</p>}
        </section>
      </div>

      {(error || message) && (
        <p className={error ? 'calendar-feedback error' : 'calendar-feedback'} role={error ? 'alert' : 'status'}>
          {error || message}
        </p>
      )}
    </section>
  );
}
