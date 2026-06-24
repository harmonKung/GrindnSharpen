const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

type AuthSessionConfig = {
  getRefreshToken: () => string | null;
  onRefreshed: (tokens: SessionTokens) => void;
  onExpired: () => void;
};

let authSessionConfig: AuthSessionConfig | null = null;
let refreshInFlight: Promise<SessionTokens> | null = null;

export function configureAuthSession(config: AuthSessionConfig) {
  authSessionConfig = config;
  return () => {
    if (authSessionConfig === config) authSessionConfig = null;
  };
}

async function refreshAuthSession() {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = authSessionConfig?.getRefreshToken();
  if (!refreshToken || !authSessionConfig) {
    throw new Error('Session expired');
  }

  const config = authSessionConfig;
  refreshInFlight = fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('Session expired');
      const tokens = await response.json() as SessionTokens;
      config.onRefreshed(tokens);
      return tokens;
    })
    .catch((error) => {
      config.onExpired();
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

export type AuthUser = {
  id: string;
  email: string;
  createdAt?: string;
};

export type Profile = {
  id?: string;
  userId?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  bodyWeightKg?: string | number | null;
  heightCm?: string | number | null;
  bodyFatPct?: string | number | null;
  unitPreference?: 'kg' | 'lb';
  experienceLevel?: string | null;
  primaryGoal?: string | null;
  secondaryGoal?: string | null;
  targetWeightKg?: string | number | null;
  targetBodyFatPct?: string | number | null;
  daysPerWeek?: number | null;
  sessionDurationMin?: number | null;
  preferredDays?: string[] | null;
  equipment?: string[] | null;
  physiqueArchetype?: string | null;
  limitations?: string | null;
  onboardingComplete?: boolean;
  onboardingStep?: number;
};

export type AuthResponse = {
  user: AuthUser;
  profile?: {
    onboardingComplete: boolean;
    onboardingStep: number;
  };
  accessToken: string;
  refreshToken: string;
};

export type RoutineExercise = {
  id: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles?: string[];
  order: number;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number;
  tempo?: string | null;
  notes?: string | null;
};

export type RoutineDay = {
  id: string;
  dayNumber: number;
  name: string;
  focus: string[];
  exercises: RoutineExercise[];
};

export type Routine = {
  id: string;
  name: string;
  goal: string;
  experienceLevel: string;
  daysPerWeek: number;
  sessionDurationMin: number;
  status: string;
  generationSource: string;
  createdAt: string;
  days: RoutineDay[];
};

export type RoutineSummary = Omit<Routine, 'days'> & {
  dayCount: number;
};

export type LoggedSet = {
  id: string;
  setNumber: number;
  setType: 'warmup' | 'working' | 'drop' | 'failure';
  weightKg: string | number | null;
  reps: number;
  rir: number | null;
  rpe: string | number | null;
  isCompleted: boolean;
  completedAt: string | null;
  notes: string | null;
};

export type WorkoutExercise = {
  id: string;
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  order: number;
  prescribedSets: number | null;
  prescribedRepMin: number | null;
  prescribedRepMax: number | null;
  targetRir: number | null;
  restSeconds: number | null;
  notes: string | null;
  sets: LoggedSet[];
  previousPerformance: PreviousPerformance | null;
  recommendation: ProgressionRecommendation;
};

export type PerformanceSet = {
  setNumber: number;
  weightKg: number | null;
  reps: number;
  rir: number | null;
};

export type PreviousPerformance = {
  workoutId: string;
  completedAt: string;
  sets: PerformanceSet[];
};

export type ProgressionRecommendation = {
  action: 'start' | 'add_weight' | 'add_reps' | 'repeat';
  weightKg: number | null;
  reps: number | null;
  message: string;
};

export type ExerciseHistory = {
  exercise: {
    id: string;
    name: string;
    primaryMuscle: string;
  };
  history: Array<{
    workoutId: string;
    workoutName: string;
    completedAt: string;
    repMin: number | null;
    repMax: number | null;
    targetRir: number | null;
    sets: PerformanceSet[];
  }>;
  recommendation: ProgressionRecommendation;
};

export type ProgressSummary = {
  weekly: { workouts: number; sets: number; volumeKg: number };
  bodyWeight: Array<{
    id: string;
    weightKg: number;
    recordedOn: string;
    notes: string | null;
  }>;
  personalRecords: Array<{
    exerciseId: string;
    name: string;
    weightKg: number;
    reps: number;
    estimatedOneRepMax: number;
    completedAt: string;
  }>;
  trackedExercises: Array<{
    id: string;
    name: string;
    primaryMuscle: string;
    lastTrainedAt: string;
  }>;
};

export type Workout = {
  id: string;
  routineId: string | null;
  routineDayId: string | null;
  routineName: string | null;
  dayNumber: number | null;
  name: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  exercises: WorkoutExercise[];
};

export type WorkoutHistoryItem = {
  id: string;
  name: string;
  status: Workout['status'];
  routineId: string | null;
  routineDayId: string | null;
  startedAt: string;
  completedAt: string | null;
  exerciseCount: number;
  completedSetCount: number;
  totalVolumeKg: string | number;
};

type ApiErrorBody = {
  error?: string;
  errors?: Array<{ msg: string }>;
};

async function request<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && accessToken && authSessionConfig) {
    const tokens = await refreshAuthSession();
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  }

  const body = await response.json().catch(() => null) as ApiErrorBody | T | null;

  if (!response.ok) {
    const message =
      (body as ApiErrorBody | null)?.error ||
      (body as ApiErrorBody | null)?.errors?.map((error) => error.msg).join(', ') ||
      'Request failed';

    throw new Error(message);
  }

  return body as T;
}

export function register(email: string, password: string) {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string) {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logoutSession(refreshToken: string) {
  return request<{ message: string }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export function getMe(accessToken: string) {
  return request<AuthUser & { profile: Profile }>('/api/auth/me', {}, accessToken);
}

export function getProfile(accessToken: string) {
  return request<Profile>('/api/profile', {}, accessToken);
}

export function updateProfile(accessToken: string, profile: Partial<Profile>) {
  return request<{ message: string; profile: Profile }>('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(profile),
  }, accessToken);
}

export function generateRoutine(accessToken: string) {
  return request<{ routine: Routine }>('/api/routines/generate', {
    method: 'POST',
  }, accessToken);
}

export function listRoutines(accessToken: string) {
  return request<{ routines: RoutineSummary[] }>('/api/routines', {}, accessToken);
}

export function getRoutine(accessToken: string, routineId: string) {
  return request<{ routine: Routine }>(`/api/routines/${routineId}`, {}, accessToken);
}

export function startWorkout(accessToken: string, routineDayId: string) {
  return request<{ workout: Workout }>('/api/workouts/start', {
    method: 'POST',
    body: JSON.stringify({ routineDayId }),
  }, accessToken);
}

export function getWorkout(accessToken: string, workoutId: string) {
  return request<{ workout: Workout }>(`/api/workouts/${workoutId}`, {}, accessToken);
}

export function listWorkoutHistory(accessToken: string) {
  return request<{ workouts: WorkoutHistoryItem[] }>('/api/workouts/history', {}, accessToken);
}

export function getExerciseHistory(accessToken: string, exerciseId: string, limit = 10) {
  return request<ExerciseHistory>(
    `/api/progress/exercises/${exerciseId}?limit=${limit}`,
    {},
    accessToken
  );
}

export function getProgressSummary(accessToken: string) {
  return request<ProgressSummary>('/api/progress/summary', {}, accessToken);
}

export function logBodyWeight(
  accessToken: string,
  entry: { weightKg: number; recordedOn?: string; notes?: string }
) {
  return request<{ entry: ProgressSummary['bodyWeight'][number] }>(
    '/api/progress/body-weight',
    { method: 'POST', body: JSON.stringify(entry) },
    accessToken
  );
}

export function deleteBodyWeight(accessToken: string, entryId: string) {
  return request<{ message: string; latestWeightKg: number | null }>(
    `/api/progress/body-weight/${entryId}`,
    { method: 'DELETE' },
    accessToken
  );
}

export function logWorkoutSet(
  accessToken: string,
  workoutId: string,
  set: {
    sessionExerciseId: string;
    setNumber: number;
    setType?: LoggedSet['setType'];
    weightKg?: number | null;
    reps: number;
    rir?: number | null;
  }
) {
  return request<{ set: LoggedSet }>(`/api/workouts/${workoutId}/sets`, {
    method: 'POST',
    body: JSON.stringify(set),
  }, accessToken);
}

export function completeWorkout(accessToken: string, workoutId: string) {
  return request<{ workout: Workout }>(`/api/workouts/${workoutId}/complete`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, accessToken);
}

export function cancelWorkout(accessToken: string, workoutId: string) {
  return request<{ workout: Workout }>(`/api/workouts/${workoutId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, accessToken);
}

export function deleteWorkout(accessToken: string, workoutId: string) {
  return request<{ message: string; workoutId: string }>(`/api/workouts/${workoutId}`, {
    method: 'DELETE',
  }, accessToken);
}
