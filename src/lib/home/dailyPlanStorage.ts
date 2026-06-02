import type { PlanGenerateResponse } from "@/lib/home/generatePlan";

const STORAGE_PREFIX = "saanjh-daily-plan";

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}

function storageKey(): string {
  return `${STORAGE_PREFIX}-${todayKey()}`;
}

export function saveDailyPlan(response: PlanGenerateResponse): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(response));
  } catch {
    // Ignore quota / private mode.
  }
}

export function loadDailyPlan(): PlanGenerateResponse | null {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    return JSON.parse(raw) as PlanGenerateResponse;
  } catch {
    return null;
  }
}

export function clearDailyPlan(): void {
  try {
    localStorage.removeItem(storageKey());
  } catch {
    // Ignore.
  }
}
