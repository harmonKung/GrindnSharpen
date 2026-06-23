import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AuthUser,
  Profile,
  Routine,
  Workout,
  WorkoutHistoryItem,
  completeWorkout,
  generateRoutine,
  getMe,
  getProfile,
  getRoutine,
  getWorkout,
  listRoutines,
  listWorkoutHistory,
  logWorkoutSet,
  login,
  register,
  startWorkout,
  updateProfile,
} from './api';
import { WorkoutHistory, WorkoutLogger } from './components/WorkoutLogger';

type AuthMode = 'login' | 'register';

type Session = {
  accessToken: string;
  refreshToken: string;
};

const sessionKey = 'grindnsharpen.session';

const defaultProfile: Partial<Profile> = {
  displayName: '',
  experienceLevel: 'beginner',
  primaryGoal: 'build_muscle',
  bodyWeightKg: '',
  heightCm: '',
  daysPerWeek: 4,
  sessionDurationMin: 60,
  equipment: ['gym_full'],
  physiqueArchetype: 'lean_aesthetic',
  limitations: '',
};

function numberOrUndefined(value: Profile[keyof Profile]) {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? undefined : numberValue;
}

function removeBlankFields(profile: Partial<Profile>) {
  return Object.fromEntries(
    Object.entries(profile).filter(([, value]) => {
      if (value === null || value === undefined || value === '') {
        return false;
      }

      if (Array.isArray(value)) {
        return value.length > 0;
      }

      return true;
    })
  ) as Partial<Profile>;
}

function buildProfilePayload(profile: Partial<Profile>) {
  return removeBlankFields({
    ...profile,
    bodyWeightKg: numberOrUndefined(profile.bodyWeightKg),
    heightCm: numberOrUndefined(profile.heightCm),
    bodyFatPct: numberOrUndefined(profile.bodyFatPct),
    targetWeightKg: numberOrUndefined(profile.targetWeightKg),
    targetBodyFatPct: numberOrUndefined(profile.targetBodyFatPct),
    daysPerWeek: numberOrUndefined(profile.daysPerWeek),
    sessionDurationMin: numberOrUndefined(profile.sessionDurationMin),
  });
}

function readSession(): Session | null {
  const raw = localStorage.getItem(sessionKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    localStorage.removeItem(sessionKey);
    return null;
  }
}

function App() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('test@example.com');
  const [password, setPassword] = useState('Password123');
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Partial<Profile>>(defaultProfile);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [workoutScreenOpen, setWorkoutScreenOpen] = useState(false);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutHistoryItem[]>([]);
  const [workoutLoading, setWorkoutLoading] = useState(false);

  const isSignedIn = !!session?.accessToken;

  useEffect(() => {
    if (!message && !error) return;

    const timeout = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [message, error]);

  const profileCompleteScore = useMemo(() => {
    const fields = [
      profile.displayName,
      profile.experienceLevel,
      profile.primaryGoal,
      profile.bodyWeightKg,
      profile.heightCm,
      profile.daysPerWeek,
      profile.sessionDurationMin,
      profile.equipment?.length,
    ];
    const complete = fields.filter(Boolean).length;
    return Math.round((complete / fields.length) * 100);
  }, [profile]);

  useEffect(() => {
    if (!session?.accessToken) return;

    async function loadSession() {
      try {
        const [me, currentProfile, routineList, history] = await Promise.all([
          getMe(session!.accessToken),
          getProfile(session!.accessToken),
          listRoutines(session!.accessToken),
          listWorkoutHistory(session!.accessToken),
        ]);

        setUser({ id: me.id, email: me.email, createdAt: me.createdAt });
        setProfile({
          ...defaultProfile,
          ...currentProfile,
          bodyWeightKg: currentProfile.bodyWeightKg ?? '',
          heightCm: currentProfile.heightCm ?? '',
          bodyFatPct: currentProfile.bodyFatPct ?? '',
          limitations: currentProfile.limitations ?? '',
          equipment: currentProfile.equipment?.length ? currentProfile.equipment : ['gym_full'],
        });

        if (routineList.routines.length > 0) {
          const latest = await getRoutine(session!.accessToken, routineList.routines[0].id);
          setRoutine(latest.routine);
          setActiveDayIndex(0);
        }

        setWorkoutHistory(history.workouts);
        const inProgress = history.workouts.find((workout) => workout.status === 'in_progress');
        if (inProgress) {
          const currentWorkout = await getWorkout(session!.accessToken, inProgress.id);
          setActiveWorkout(currentWorkout.workout);
          setWorkoutScreenOpen(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your session');
      }
    }

    loadSession();
  }, [session]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = mode === 'login'
        ? await login(email, password)
        : await register(email, password);

      const nextSession = {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      };

      localStorage.setItem(sessionKey, JSON.stringify(nextSession));
      setSession(nextSession);
      setUser(response.user);
      setMessage(mode === 'login' ? 'Signed in.' : 'Account created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.accessToken) return;

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const payload = buildProfilePayload(profile);
      const response = await updateProfile(session.accessToken, payload);
      setProfile({ ...profile, ...response.profile });
      setMessage('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateRoutine() {
    if (!session?.accessToken) return;

    setGenerating(true);
    setError('');
    setMessage('');

    try {
      await updateProfile(session.accessToken, buildProfilePayload(profile));
      const response = await generateRoutine(session.accessToken);
      setRoutine(response.routine);
      setActiveDayIndex(0);
      setMessage('New routine generated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate routine');
    } finally {
      setGenerating(false);
    }
  }

  async function refreshWorkoutHistory(accessToken: string) {
    const history = await listWorkoutHistory(accessToken);
    setWorkoutHistory(history.workouts);
  }

  async function handleStartWorkout(routineDayId: string) {
    if (!session?.accessToken) return;

    setWorkoutLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await startWorkout(session.accessToken, routineDayId);
      setActiveWorkout(response.workout);
      setWorkoutScreenOpen(true);
      await refreshWorkoutHistory(session.accessToken);
      setMessage('Workout started.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start workout');
    } finally {
      setWorkoutLoading(false);
    }
  }

  async function handleLogSet(
    sessionExerciseId: string,
    setNumber: number,
    draft: { weightKg: string; reps: string; rir: string }
  ) {
    if (!session?.accessToken || !activeWorkout) return;

    setError('');
    try {
      await logWorkoutSet(session.accessToken, activeWorkout.id, {
        sessionExerciseId,
        setNumber,
        weightKg: draft.weightKg === '' ? null : Number(draft.weightKg),
        reps: Number(draft.reps),
        rir: draft.rir === '' ? null : Number(draft.rir),
      });
      const refreshed = await getWorkout(session.accessToken, activeWorkout.id);
      setActiveWorkout(refreshed.workout);
      setMessage('Set logged.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log set');
      throw err;
    }
  }

  async function handleCompleteWorkout() {
    if (!session?.accessToken || !activeWorkout) return;

    setError('');
    try {
      await completeWorkout(session.accessToken, activeWorkout.id);
      setActiveWorkout(null);
      setWorkoutScreenOpen(false);
      await refreshWorkoutHistory(session.accessToken);
      setMessage('Workout completed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete workout');
      throw err;
    }
  }

  function logout() {
    localStorage.removeItem(sessionKey);
    setSession(null);
    setUser(null);
    setProfile(defaultProfile);
    setRoutine(null);
    setActiveDayIndex(0);
    setActiveWorkout(null);
    setWorkoutScreenOpen(false);
    setWorkoutHistory([]);
    setMessage('');
    setError('');
  }

  return (
    <main className="app-shell">
      <section className="brand-panel">
        <div>
          <h1 className="brand-title">GrindnSharpen</h1>
          <p className="hero-line">Build a profile your training plan can actually use.</p>
          <p className="lede">
            Capture the training basics now: goal, body stats, schedule, equipment, and target look.
          </p>
        </div>

        <div className="status-strip">
          <div>
            <strong>{isSignedIn ? 'Signed in' : 'Guest'}</strong>
            <span>{user?.email ?? 'Connect your account'}</span>
          </div>
          <div>
            <strong>{profileCompleteScore}%</strong>
            <span>Profile ready</span>
          </div>
        </div>
      </section>

      {!isSignedIn ? (
        <section className="work-panel auth-panel">
          <div className="panel-heading">
            <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
            <button
              className="ghost-button"
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Register' : 'Log in'}
            </button>
          </div>

          <form onSubmit={handleAuth} className="form-grid">
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>

            <button className="primary-button" disabled={loading}>
              {loading ? 'Working...' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>

          <Feedback message={message} error={error} />
        </section>
      ) : activeWorkout && workoutScreenOpen ? (
        <section className="work-panel workout-page">
          <WorkoutLogger
            workout={activeWorkout}
            onLogSet={handleLogSet}
            onComplete={handleCompleteWorkout}
            onExit={() => setWorkoutScreenOpen(false)}
          />
        </section>
      ) : (
        <section className="work-panel">
          <div className="panel-heading">
            <div>
              <h2>Training profile</h2>
              <p>{user?.email}</p>
            </div>
            <Feedback message={message} error={error} />
            <button className="ghost-button" type="button" onClick={logout}>
              Log out
            </button>
          </div>

          <form onSubmit={handleProfileSubmit} className="profile-grid">
            <label>
              Display name
              <input
                value={profile.displayName ?? ''}
                onChange={(event) => setProfile({ ...profile, displayName: event.target.value })}
              />
            </label>

            <label>
              Experience
              <select
                value={profile.experienceLevel ?? 'beginner'}
                onChange={(event) => setProfile({ ...profile, experienceLevel: event.target.value })}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>

            <label>
              Primary goal
              <select
                value={profile.primaryGoal ?? 'build_muscle'}
                onChange={(event) => setProfile({ ...profile, primaryGoal: event.target.value })}
              >
                <option value="build_muscle">Build muscle</option>
                <option value="lose_fat">Lose fat</option>
                <option value="recomp">Recomp</option>
                <option value="strength">Strength</option>
                <option value="endurance">Endurance</option>
                <option value="general_fitness">General fitness</option>
              </select>
            </label>

            <label>
              Body weight kg
              <input
                type="number"
                min="20"
                max="500"
                value={profile.bodyWeightKg ?? ''}
                onChange={(event) => setProfile({ ...profile, bodyWeightKg: event.target.value })}
              />
            </label>

            <label>
              Height cm
              <input
                type="number"
                min="50"
                max="300"
                value={profile.heightCm ?? ''}
                onChange={(event) => setProfile({ ...profile, heightCm: event.target.value })}
              />
            </label>

            <label>
              Days per week
              <input
                type="number"
                min="1"
                max="7"
                value={profile.daysPerWeek ?? 4}
                onChange={(event) => setProfile({ ...profile, daysPerWeek: Number(event.target.value) })}
              />
            </label>

            <label>
              Session minutes
              <input
                type="number"
                min="20"
                max="180"
                value={profile.sessionDurationMin ?? 60}
                onChange={(event) => setProfile({ ...profile, sessionDurationMin: Number(event.target.value) })}
              />
            </label>

            <label>
              Equipment
              <select
                value={profile.equipment?.[0] ?? 'gym_full'}
                onChange={(event) => setProfile({ ...profile, equipment: [event.target.value] })}
              >
                <option value="gym_full">Full gym</option>
                <option value="gym_basic">Basic gym</option>
                <option value="home_dumbbells">Home dumbbells</option>
                <option value="home_barbell">Home barbell</option>
                <option value="resistance_bands">Resistance bands</option>
                <option value="bodyweight_only">Bodyweight only</option>
              </select>
            </label>

            <label>
              Target physique
              <select
                value={profile.physiqueArchetype ?? 'lean_aesthetic'}
                onChange={(event) => setProfile({ ...profile, physiqueArchetype: event.target.value })}
              >
                <option value="lean_aesthetic">Lean aesthetic</option>
                <option value="bodybuilder">Bodybuilder</option>
                <option value="athletic">Athletic</option>
                <option value="powerlifter">Powerlifter</option>
                <option value="functional">Functional</option>
              </select>
            </label>

            <label className="wide">
              Limitations
              <textarea
                value={profile.limitations ?? ''}
                onChange={(event) => setProfile({ ...profile, limitations: event.target.value })}
                rows={4}
              />
            </label>

            <div className="wide actions-row">
              <button className="primary-button" disabled={loading}>
                {loading ? 'Saving...' : 'Save profile'}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={generating}
                onClick={handleGenerateRoutine}
              >
                {generating ? 'Generating...' : routine ? 'Generate new routine' : 'Generate routine'}
              </button>
            </div>
          </form>

          {routine && (
            <RoutineView
              routine={routine}
              activeDayIndex={activeDayIndex}
              onDayChange={setActiveDayIndex}
              onStartWorkout={handleStartWorkout}
              onResumeWorkout={() => setWorkoutScreenOpen(true)}
              workoutLoading={workoutLoading}
              hasActiveWorkout={!!activeWorkout}
            />
          )}

          <WorkoutHistory workouts={workoutHistory} />
        </section>
      )}
    </main>
  );
}

function Feedback({ message, error }: { message: string; error: string }) {
  if (!message && !error) return null;

  return (
    <div
      className={error ? 'feedback toast error' : 'feedback toast'}
      role={error ? 'alert' : 'status'}
      aria-live="polite"
    >
      {error || message}
    </div>
  );
}

function RoutineView({
  routine,
  activeDayIndex,
  onDayChange,
  onStartWorkout,
  onResumeWorkout,
  workoutLoading,
  hasActiveWorkout,
}: {
  routine: Routine;
  activeDayIndex: number;
  onDayChange: (index: number) => void;
  onStartWorkout: (routineDayId: string) => Promise<void>;
  onResumeWorkout: () => void;
  workoutLoading: boolean;
  hasActiveWorkout: boolean;
}) {
  const activeDay = routine.days[activeDayIndex] ?? routine.days[0];
  if (!activeDay) return null;

  return (
    <section className="routine-section">
      <div className="routine-heading">
        <div>
          <p className="section-label">Current routine</p>
          <h2>{routine.name}</h2>
        </div>
        <div className="routine-meta">
          <span>{routine.daysPerWeek} days</span>
          <span>{routine.sessionDurationMin} min</span>
          <span>{routine.experienceLevel}</span>
        </div>
      </div>

      <div className="day-tabs" role="tablist" aria-label="Routine days">
        {routine.days.map((day, index) => (
          <button
            key={day.id}
            type="button"
            role="tab"
            aria-selected={index === activeDayIndex}
            className={index === activeDayIndex ? 'day-tab active' : 'day-tab'}
            onClick={() => onDayChange(index)}
          >
            <span>Day {day.dayNumber}</span>
            <strong>{day.name}</strong>
          </button>
        ))}
      </div>

      <div className="day-summary">
        <div>
          <p className="section-label">Day {activeDay.dayNumber}</p>
          <h3>{activeDay.name}</h3>
        </div>
        <div className="day-actions">
          <p>{activeDay.focus.join(' / ')}</p>
          <button
            type="button"
            className="primary-button"
            disabled={workoutLoading}
            onClick={() => hasActiveWorkout ? onResumeWorkout() : onStartWorkout(activeDay.id)}
          >
            {hasActiveWorkout ? 'Resume workout' : workoutLoading ? 'Starting...' : 'Start workout'}
          </button>
        </div>
      </div>

      <div className="exercise-list">
        {activeDay.exercises.map((exercise) => (
          <div className="exercise-row" key={`${activeDay.id}-${exercise.order}`}>
            <span className="exercise-order">{exercise.order}</span>
            <div className="exercise-name">
              <strong>{exercise.name}</strong>
              <span>{exercise.primaryMuscle}</span>
            </div>
            <div className="exercise-prescription">
              <strong>{exercise.sets} x {exercise.repMin}-{exercise.repMax}</strong>
              <span>{exercise.targetRir} RIR</span>
            </div>
            <div className="exercise-rest">
              <strong>{exercise.restSeconds}s</strong>
              <span>Rest</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default App;
