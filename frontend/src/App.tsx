import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AuthUser,
  Profile,
  Routine,
  Workout,
  WorkoutHistoryItem,
  completeWorkout,
  deleteWorkout,
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
import { ProgressDashboard } from './components/ProgressDashboard';
import { UnitPreference, formatWeight, fromKilograms, toKilograms } from './units';

type AuthMode = 'login' | 'register';
type MainView = 'profile' | 'routine' | 'progress';

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
  unitPreference: 'kg',
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
  const [mainView, setMainView] = useState<MainView>('profile');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileBeforeEdit, setProfileBeforeEdit] = useState<Partial<Profile> | null>(null);

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
          setWorkoutScreenOpen(false);
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
      setEditingProfile(false);
      setProfileBeforeEdit(null);
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
        weightKg: toKilograms(draft.weightKg, profile.unitPreference ?? 'kg'),
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

  async function handleDeleteWorkout(workoutId: string) {
    if (!session?.accessToken) return;

    setError('');
    try {
      await deleteWorkout(session.accessToken, workoutId);
      if (activeWorkout?.id === workoutId) {
        setActiveWorkout(null);
        setWorkoutScreenOpen(false);
      }
      await refreshWorkoutHistory(session.accessToken);
      setMessage('Workout deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete workout');
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
    setMainView('profile');
    setEditingProfile(false);
    setProfileBeforeEdit(null);
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
            unitPreference={profile.unitPreference ?? 'kg'}
            onLogSet={handleLogSet}
            onComplete={handleCompleteWorkout}
            onExit={() => setWorkoutScreenOpen(false)}
          />
        </section>
      ) : (
        <section className="work-panel">
          <div className="panel-heading">
            <div>
              <h2>Training hub</h2>
              <p>{user?.email}</p>
            </div>
            <Feedback message={message} error={error} />
            <button className="ghost-button" type="button" onClick={logout}>
              Log out
            </button>
          </div>

          <nav className="workspace-tabs" role="tablist" aria-label="Training sections">
            <button type="button" role="tab" aria-selected={mainView === 'profile'} className={mainView === 'profile' ? 'active' : ''} onClick={() => setMainView('profile')}>
              Training profile
            </button>
            <button type="button" role="tab" aria-selected={mainView === 'routine'} className={mainView === 'routine' ? 'active' : ''} onClick={() => setMainView('routine')}>
              Routine
            </button>
            <button type="button" role="tab" aria-selected={mainView === 'progress'} className={mainView === 'progress' ? 'active' : ''} onClick={() => setMainView('progress')}>
              Training trend
            </button>
          </nav>

          {mainView === 'profile' && !editingProfile && (
            <section className="profile-summary tab-page" role="tabpanel">
              <div className="profile-summary-heading">
                <div><p className="section-label">Your details</p><h2>{profile.displayName || 'Training profile'}</h2></div>
                <button className="secondary-button" type="button" onClick={() => {
                  setProfileBeforeEdit({ ...profile, equipment: [...(profile.equipment ?? [])] });
                  setEditingProfile(true);
                }}>Edit profile</button>
              </div>
              <dl className="profile-info-grid">
                <div><dt>Experience</dt><dd>{profile.experienceLevel?.replace('_', ' ') || 'Not set'}</dd></div>
                <div><dt>Primary goal</dt><dd>{profile.primaryGoal?.replace(/_/g, ' ') || 'Not set'}</dd></div>
                <div><dt>Body weight</dt><dd>{formatWeight(profile.bodyWeightKg, profile.unitPreference ?? 'kg')}</dd></div>
                <div><dt>Height</dt><dd>{profile.heightCm ? `${profile.heightCm} cm` : 'Not set'}</dd></div>
                <div><dt>Training schedule</dt><dd>{profile.daysPerWeek ?? '-'} days / {profile.sessionDurationMin ?? '-'} min</dd></div>
                <div><dt>Target physique</dt><dd>{profile.physiqueArchetype?.replace(/_/g, ' ') || 'Not set'}</dd></div>
                <div><dt>Display units</dt><dd>{profile.unitPreference === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}</dd></div>
                <div className="wide"><dt>Limitations</dt><dd>{profile.limitations || 'None listed'}</dd></div>
              </dl>
            </section>
          )}

          {mainView === 'profile' && editingProfile && (
          <form onSubmit={handleProfileSubmit} className="profile-grid tab-page" role="tabpanel">
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
              Body weight {profile.unitPreference ?? 'kg'}
              <input
                type="number"
                min={profile.unitPreference === 'lb' ? 44 : 20}
                max={profile.unitPreference === 'lb' ? 1102 : 500}
                step="0.1"
                value={fromKilograms(profile.bodyWeightKg, profile.unitPreference ?? 'kg')}
                onChange={(event) => setProfile({
                  ...profile,
                  bodyWeightKg: toKilograms(event.target.value, profile.unitPreference ?? 'kg') ?? '',
                })}
              />
            </label>

            <label>
              Display units
              <select
                value={profile.unitPreference ?? 'kg'}
                onChange={(event) => setProfile({ ...profile, unitPreference: event.target.value as UnitPreference })}
              >
                <option value="kg">Kilograms (kg)</option>
                <option value="lb">Pounds (lb)</option>
              </select>
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
              <button className="ghost-button" type="button" onClick={() => {
                if (profileBeforeEdit) setProfile(profileBeforeEdit);
                setEditingProfile(false);
                setProfileBeforeEdit(null);
              }}>Cancel</button>
            </div>
          </form>
          )}

          {mainView === 'routine' && (
            <section className="routine-workspace tab-page" role="tabpanel">
              <div className="routine-controls">
                <div>
                  <p className="section-label">Routine setup</p>
                  <h2>{routine ? 'Current routine' : 'Build your routine'}</h2>
                </div>
                <div className="routine-generator-controls">
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
                  <button className="secondary-button" type="button" disabled={generating} onClick={handleGenerateRoutine}>
                    {generating ? 'Generating...' : routine ? 'Generate new routine' : 'Generate routine'}
                  </button>
                </div>
              </div>

              {routine ? (
                <RoutineView
                  routine={routine}
                  activeDayIndex={activeDayIndex}
                  onDayChange={setActiveDayIndex}
                  onStartWorkout={handleStartWorkout}
                  onResumeWorkout={() => setWorkoutScreenOpen(true)}
                  workoutLoading={workoutLoading}
                  hasActiveWorkout={!!activeWorkout}
                />
              ) : (
                <p className="routine-empty">Choose your equipment, then generate your first routine.</p>
              )}
            </section>
          )}

          {mainView === 'progress' && (
            <div className="tab-page" role="tabpanel">
              <ProgressDashboard
                accessToken={session.accessToken}
                currentWeight={profile.bodyWeightKg}
                unitPreference={profile.unitPreference ?? 'kg'}
                onWeightLogged={(weightKg) => setProfile((current) => ({
                  ...current,
                  bodyWeightKg: weightKg ?? '',
                }))}
              />
              <WorkoutHistory workouts={workoutHistory} onDelete={handleDeleteWorkout} unitPreference={profile.unitPreference ?? 'kg'} />
            </div>
          )}
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
          <span>{routine.generationSource === 'ai' ? 'AI generated' : 'Rules generated'}</span>
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
