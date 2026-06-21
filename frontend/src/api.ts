const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

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

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

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
