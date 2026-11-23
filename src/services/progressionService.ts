export type PerformanceSet = {
  setNumber: number;
  weightKg: number | null;
  reps: number;
  rir: number | null;
};

export type ProgressionRecommendation = {
  action: 'start' | 'add_weight' | 'add_reps' | 'repeat';
  weightKg: number | null;
  reps: number | null;
  message: string;
};

export type DeloadMetrics = {
  recentVolumeKg: number;
  previousVolumeKg: number;
  recentWorkouts: number;
  previousWorkouts: number;
  recentAverageRir: number | null;
  recentHardSetRatio: number;
};

export type DeloadAssessment = {
  status: 'needed' | 'monitor' | 'none';
  reason: string;
  volumeChangePct: number;
};

export function buildDeloadAssessment(metrics: DeloadMetrics): DeloadAssessment {
  const volumeChangePct = metrics.previousVolumeKg > 0
    ? ((metrics.recentVolumeKg - metrics.previousVolumeKg) / metrics.previousVolumeKg) * 100
    : 0;

  const enoughHistory =
    metrics.recentWorkouts >= 3 &&
    metrics.previousWorkouts >= 3 &&
    metrics.recentAverageRir !== null;
  const workloadIncreased = volumeChangePct >= 10;
  const workingVeryHard = metrics.recentAverageRir !== null &&
    metrics.recentAverageRir <= 1.5 &&
    metrics.recentHardSetRatio >= 0.5;

  if (enoughHistory && workloadIncreased && workingVeryHard) {
    return {
      status: 'needed',
      reason: 'Your workload has risen while most recent working sets have been close to failure.',
      volumeChangePct: Math.round(volumeChangePct),
    };
  }

  if (enoughHistory && (workloadIncreased || workingVeryHard)) {
    return {
      status: 'monitor',
      reason: 'Recent training stress is elevated. Watch for repeated missed reps and unusually high fatigue.',
      volumeChangePct: Math.round(volumeChangePct),
    };
  }

  return {
    status: 'none',
    reason: 'No strong fatigue or workload signal is present right now.',
    volumeChangePct: Math.round(volumeChangePct),
  };
}

type Prescription = {
  repMin: number | null;
  repMax: number | null;
  targetRir: number | null;
  primaryMuscle: string;
};

const lowerBodyMuscles = new Set(['quadriceps', 'hamstrings', 'glutes', 'calves']);

export function buildProgressionRecommendation(
  sets: PerformanceSet[],
  prescription: Prescription
): ProgressionRecommendation {
  if (sets.length === 0) {
    return {
      action: 'start',
      weightKg: null,
      reps: prescription.repMin,
      message: 'Choose a controlled starting weight and finish with the target RIR.',
    };
  }

  const repMin = prescription.repMin ?? 1;
  const repMax = prescription.repMax ?? repMin;
  const targetRir = prescription.targetRir ?? 2;
  const workingWeights = sets
    .map((set) => set.weightKg)
    .filter((weight): weight is number => weight !== null);
  const previousWeight = workingWeights.length > 0 ? Math.max(...workingWeights) : null;
  const reachedTopOfRange = sets.every(
    (set) => set.reps >= repMax && (set.rir === null || set.rir >= targetRir)
  );

  if (reachedTopOfRange && previousWeight !== null) {
    const increase = lowerBodyMuscles.has(prescription.primaryMuscle) ? 5 : 2.5;
    return {
      action: 'add_weight',
      weightKg: previousWeight + increase,
      reps: repMin,
      message: `Add ${increase} kg and restart at the bottom of the rep range.`,
    };
  }

  if (sets.some((set) => set.reps < repMin)) {
    return {
      action: 'repeat',
      weightKg: previousWeight,
      reps: repMin,
      message: 'Repeat the weight and bring every working set into the rep range.',
    };
  }

  const nextReps = Math.min(repMax, Math.min(...sets.map((set) => set.reps)) + 1);
  return {
    action: 'add_reps',
    weightKg: previousWeight,
    reps: nextReps,
    message: `Keep the weight and aim for ${nextReps} reps on each working set.`,
  };
}
