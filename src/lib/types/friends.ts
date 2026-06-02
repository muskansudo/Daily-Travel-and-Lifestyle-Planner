export type EnergyAlignmentTier =
  | "high"
  | "good"
  | "building"
  | "none";

export type AvailabilityKind =
  | "perfect_overlap_tonight"
  | "free_this_weekend"
  | "no_overlap"
  | "friend_calendar_not_linked"
  | "my_calendar_not_linked"
  | "both_calendar_not_linked";

export interface FriendAvailability {
  kind: AvailabilityKind;
  title: string;
  subtitle: string | null;
  bestOverlapStart?: string;
  bestOverlapEnd?: string;
  overlapDurationMinutes?: number;
}

export interface FriendSummary {
  id: string;
  displayName: string | null;
  profilePhotoUrl: string | null;
  interestTags: string[];
  lifestyleTags: string[];
  dietaryTags: string[];
  energyAlignmentPercent: number;
  energyAlignmentTier: EnergyAlignmentTier;
  availability: FriendAvailability;
}

/** One mutual free window today — used in the modal and future joint plan generation. */
export interface SharedFreeTimeWindow {
  id: string;
  rangeLabel: string;
  durationLabel: string;
  startIso: string;
  endIso: string;
  durationMinutes: number;
  /** Relative to current time when the modal was loaded. */
  status: "past" | "current" | "upcoming";
}

export interface CompatibilityPayload {
  friendId: string;
  friendDisplayName: string | null;
  energyAlignmentPercent: number;
  availability: FriendAvailability;
  /** All shared free windows for today (IST), chronological. */
  sharedFreeTimes: SharedFreeTimeWindow[];
  sharedInterestTags: string[];
  sharedLifestyleTags: string[];
  sharedDietaryTags: string[];
  sharedInterestLabels: string[];
  sharedLifestyleLabels: string[];
  sharedDietaryLabels: string[];
}

export interface FriendSearchResult {
  id: string;
  displayName: string | null;
  profilePhotoUrl: string | null;
}

export interface FriendshipPair {
  userLowId: string;
  userHighId: string;
}

export interface FriendExpenseRow {
  id: string;
  user_low_id: string;
  user_high_id: string;
  description: string;
  place: string | null;
  amount_paise: number;
  paid_by_user_id: string;
  split_mode: string;
  settled_at: string | null;
  created_at: string;
}

export interface ExpenseBalance {
  /** Positive: current user is owed; negative: current user owes. */
  netPaise: number;
  /** Human-readable, e.g. "Aarav owes You ₹400" */
  label: string;
}

export interface FriendExpenseDTO {
  id: string;
  description: string;
  place: string | null;
  amountInr: number;
  paidByUserId: string;
  paidByMe: boolean;
  splitMode: "equal";
  settled: boolean;
  settledAt: string | null;
  createdAt: string;
  /** Per-expense line, e.g. "Aarav owes ₹200" */
  oweLabel: string;
}

export interface SharedPlanDTO {
  id: string;
  title: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  windowCount?: number;
  firstWindowLabel?: string | null;
}

export interface FriendPlansResponse {
  friendId: string;
  friendDisplayName: string | null;
  plans: SharedPlanDTO[];
}

export interface FriendExpensesResponse {
  friendId: string;
  friendDisplayName: string | null;
  expenses: FriendExpenseDTO[];
  balance: ExpenseBalance;
}

/** Serialized plan stop — mirrors src/lib/ai/plan.ts Plan. */
export interface CollabPlanStop {
  venueId: string;
  venueName: string;
  category: string;
  neighborhood: string;
  startTime: string;
  endTime: string;
  whyThis: string;
}

export interface CollabPlanBody {
  stops: CollabPlanStop[];
  summary: string;
  aiGenerated: boolean;
}

export type SharedWindowStatus = "past" | "current" | "upcoming";

export interface CollabPlannedWindow {
  freeWindow: { start: string; end: string };
  plan: CollabPlanBody;
  candidatesCount: number;
  status: SharedWindowStatus;
  rangeLabel: string;
  durationMinutes: number;
  skippedReason?: "past" | "cap";
}

export interface CollabSerializedCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string | null;
  allDay: boolean;
}

export interface CollabPlanCompatibilityMeta {
  energyAlignmentPercent: number;
  sharedInterestLabels: string[];
  sharedLifestyleLabels: string[];
  sharedDietaryLabels: string[];
  friendDisplayName: string | null;
}

export interface CollabPlanGenerateDebug {
  totalWindows: number;
  plannedWindows: number;
  reason?: "no_shared_windows";
  cappedAt?: number;
  ragTopK?: number;
}

/** Mirrors solo PlanGenerateResponse for shared timeline UI. */
export interface CollabPlanGenerateResponse {
  friendId: string;
  windows: CollabPlannedWindow[];
  events: CollabSerializedCalendarEvent[];
  compatibility: CollabPlanCompatibilityMeta;
  debug: CollabPlanGenerateDebug;
}

export interface SharedPlanWindowPayload {
  freeWindow: {
    startIso: string;
    endIso: string;
    rangeLabel: string;
    durationMinutes: number;
    status: SharedWindowStatus;
  };
  plan: CollabPlanBody;
  candidatesCount: number;
  skippedReason?: "past" | "cap";
}

export interface SharedPlanPayloadV1 {
  version: 1;
  windows: SharedPlanWindowPayload[];
  events: CollabSerializedCalendarEvent[];
  meta: {
    energyAlignmentPercent: number;
    sharedInterestLabels: string[];
    sharedLifestyleLabels: string[];
    sharedDietaryLabels: string[];
    aiGenerated: boolean;
  };
  createdByUserId: string;
  generatedAt: string;
}

export interface SharedPlanDetailDTO extends SharedPlanDTO {
  planPayload: SharedPlanPayloadV1;
  friendId: string;
  friendDisplayName: string | null;
}

export interface SaveSharedPlanResponse {
  plan: SharedPlanDTO;
  friendId: string;
}
