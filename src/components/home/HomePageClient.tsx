// DROP IN AT: src/components/home/HomePageClient.tsx (REPLACES existing file)

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import type {
  GeneratedPlan,
  GeneratePlanFilters,
  HomePageState,
  ManualScheduleEntry,
  TimelineItem,
  WeatherInfo,
} from "@/lib/types/home";
import { DEFAULT_VIBE_IMAGE } from "@/lib/constants/vibes";
import { MOCK_WEATHER } from "@/lib/mock/homePlan";
import {
  buildGeneratedPlanFromResponse,
  countEmptyWindows,
  isNoCalendarConnected,
  isPackedDay,
  replaceStopInResponse,
  requestPlanGeneration,
  requestStopReplacement,
  venueIdsInResponse,
  type PlanGenerateResponse,
} from "@/lib/home/generatePlan";
import {
  clearDailyPlan,
  loadDailyPlan,
  saveDailyPlan,
} from "@/lib/home/dailyPlanStorage";
import {
  isPlanningQuietHours,
} from "@/lib/planning/quietHours";
import { PlanningQuietHoursNotice } from "@/components/planning/PlanningQuietHoursNotice";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { HomeHeader } from "./HomeHeader";
import { VibeSelector } from "@/components/home/VibeSelector";
import { GeneratePlanCard } from "./GeneratePlanCard";
import { ManualScheduleSheet } from "./ManualScheduleSheet";
import { GenerationSequence } from "./GenerationSequence";
import { PlanTimeline } from "./PlanTimeline";
import { OutfitCard } from "./OutfitCard";
import { EditProfileSheet } from "@/components/profile/EditProfileSheet";
import { VenueCarousel } from "./VenueCarousel";
import { EveningReflection } from "./EveningReflection";
import { BottomNav } from "./BottomNav";
import { staggerContainer, staggerItem } from "./animations";

function PlanStatusBanner({
  response,
}: {
  response: PlanGenerateResponse;
}) {
  if (isNoCalendarConnected(response)) {
    return (
      <div className="glass-panel silk-border rounded-2xl p-6 text-center">
        <p className="font-playfair text-lg text-on-surface">
          Connect a calendar to see your day&apos;s rhythm
        </p>
        <Link
          href="/onboarding/calendar"
          className="btn-premium mt-4 inline-flex rounded-full px-6 py-3 font-montserrat text-xs font-semibold uppercase tracking-wider"
        >
          Connect Calendar
        </Link>
      </div>
    );
  }

  if (isPackedDay(response)) {
    return (
      <div className="glass-panel silk-border rounded-2xl p-6 text-center">
        <p className="font-playfair text-lg text-on-surface">
          Looks like a full day ahead. We&apos;ll plan again tomorrow.
        </p>
      </div>
    );
  }

  const emptyWindows = countEmptyWindows(response);
  if (emptyWindows > 0) {
    return (
      <div className="glass-panel silk-border rounded-2xl p-4 text-center">
        <p className="font-montserrat text-sm text-on-surface-variant">
          {emptyWindows === 1
            ? "One free window had no venue matches. Try a different vibe."
            : `${emptyWindows} free windows had no venue matches. Try a different vibe.`}
        </p>
      </div>
    );
  }

  return null;
}

export function HomePageClient({
  userName,
  profileImageUrl,
  weather = MOCK_WEATHER,
}: {
  userName: string;
  profileImageUrl?: string | null;
  weather?: WeatherInfo;
}) {
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [localUserName, setLocalUserName] = useState(userName);
  const [localProfileImageUrl, setLocalProfileImageUrl] = useState(profileImageUrl);

  useEffect(() => {
    setLocalUserName(userName);
  }, [userName]);

  useEffect(() => {
    setLocalProfileImageUrl(profileImageUrl);
  }, [profileImageUrl]);

  const [pageState, setPageState] = useState<HomePageState>("initial");
  const [vibeImageUrl, setVibeImageUrl] = useState(DEFAULT_VIBE_IMAGE);
  const [vibeImageFile, setVibeImageFile] = useState<File | null>(null);
  const [manualSheetOpen, setManualSheetOpen] = useState(false);
  const [manualEntries, setManualEntries] = useState<ManualScheduleEntry[]>(
    []
  );
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(
    null
  );
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [generateFilters] = useState<GeneratePlanFilters>({
    hoursAhead: 16,
  });

  // Session-level reject list: venue ids the user has tapped "Not this one"
  // on during this browsing session. Survives across multiple skip rounds
  // but resets on full Regenerate or page reload.
  const [rejectedVenueIds, setRejectedVenueIds] = useState<string[]>([]);
  const [skippingItemId, setSkippingItemId] = useState<string | null>(null);
  const [skipError, setSkipError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [quietHours, setQuietHours] = useState(() => isPlanningQuietHours());

  const planResponseRef = useRef<PlanGenerateResponse | null>(null);

  useEffect(() => {
    const syncQuietHours = () => setQuietHours(isPlanningQuietHours());
    syncQuietHours();
    const interval = window.setInterval(syncQuietHours, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const stored = loadDailyPlan();
    if (stored) {
      const plan = buildGeneratedPlanFromResponse(stored);
      setGeneratedPlan(plan);
      planResponseRef.current = stored;
    }

    void fetch("/api/onboarding/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    void fetch("/api/schedule/manual")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.entries && Array.isArray(data.entries)) {
          setManualEntries(data.entries);
        }
      })
      .catch(() => null);
  }, []);

  const handleImageChange = useCallback((url: string, file: File | null) => {
    setVibeImageUrl(url);
    setVibeImageFile(file);
  }, []);

  const handleGenerate = useCallback(async () => {
    setPageState("generating");
    setGenerateError(null);
    setApiReady(false);
    planResponseRef.current = null;

    try {
      const response = await requestPlanGeneration({
        vibeImageFile,
        manualEntries,
        allowedNeighborhoods: generateFilters.allowedNeighborhoods,
        allowedCategories: generateFilters.allowedCategories,
        hoursAhead: generateFilters.hoursAhead,
      });

      planResponseRef.current = response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Plan generation failed";
      setGenerateError(message);
    } finally {
      setApiReady(true);
    }
  }, [
    generateFilters.allowedCategories,
    generateFilters.allowedNeighborhoods,
    generateFilters.hoursAhead,
    manualEntries,
    vibeImageFile,
  ]);

  const handleGenerationComplete = useCallback(() => {
    if (generateError || !planResponseRef.current) {
      setPageState("initial");
      return;
    }

    const plan = buildGeneratedPlanFromResponse(planResponseRef.current);
    setGeneratedPlan(plan);
    saveDailyPlan(planResponseRef.current);
    setPageState("generated");
  }, [generateError]);

  const handleViewDay = useCallback(() => {
    if (!generatedPlan) return;
    setPageState("generated");
  }, [generatedPlan]);

  const handleManualSave = useCallback((entries: ManualScheduleEntry[]) => {
    const valid = entries.filter(
      (entry) =>
        entry.startTime &&
        entry.endTime &&
        entry.startTime !== entry.endTime &&
        entry.activity.trim()
    );
    setManualEntries(valid);

    void fetch("/api/schedule/manual", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: valid }),
    }).catch(() => null);
  }, []);

  const handleRegenerate = () => {
    setGeneratedPlan(null);
    planResponseRef.current = null;
    setRejectedVenueIds([]);
    setSkipError(null);
    clearDailyPlan();
    setPageState("initial");
  };

  // ---- Skip-this-stop wiring ----

  const handleSkipStop = useCallback(
    async (item: TimelineItem) => {
      const response = planResponseRef.current;
      if (
        !response ||
        item.kind !== "plan_stop" ||
        !item.endTime ||
        !item.category
      ) {
        return;
      }

      // Find the underlying stop to grab its venueId. The TimelineItem id
      // shape is `stop-<venueId>-<startTime>`, so we can parse it back out.
      // We also walk windows so we can verify against authoritative data.
      let venueId: string | null = null;
      for (const window of response.windows) {
        for (const stop of window.plan.stops) {
          if (
            stop.startTime === item.time &&
            stop.venueName === item.activity
          ) {
            venueId = stop.venueId;
            break;
          }
        }
        if (venueId) break;
      }
      if (!venueId) return;

      setSkippingItemId(item.id);
      setSkipError(null);

      try {
        const dayWideIds = venueIdsInResponse(response);
        const excludeVenueIds = Array.from(
          new Set([...dayWideIds, ...rejectedVenueIds, venueId])
        );

        const result = await requestStopReplacement({
          venueIdToReplace: venueId,
          slot: { startTime: item.time, endTime: item.endTime },
          excludeVenueIds,
          vibes: response.mood?.vibes ?? [],
          manualEntries,
          hoursAhead: generateFilters.hoursAhead,
          allowedNeighborhoods: generateFilters.allowedNeighborhoods,
          allowedCategories: generateFilters.allowedCategories,
        });

        if (!result.newStop) {
          const message =
            result.reason === "no_alternatives"
              ? "No other matches for this time slot."
              : result.reason === "overlap_busy"
                ? "Couldn't find a stop that fits around your schedule."
                : "Couldn't refresh this stop. Try again in a moment.";
          setSkipError({ id: item.id, message });
          // Still track the rejection so a retry won't surface the same venue.
          setRejectedVenueIds((prev) =>
            prev.includes(venueId!) ? prev : [...prev, venueId!]
          );
          return;
        }

        // Success: swap the stop in the cached response, rebuild the
        // GeneratedPlan, persist to localStorage.
        const updated = replaceStopInResponse(
          response,
          venueId,
          item.time,
          result.newStop
        );
        planResponseRef.current = updated;
        setGeneratedPlan(buildGeneratedPlanFromResponse(updated));
        saveDailyPlan(updated);
        setRejectedVenueIds((prev) =>
          prev.includes(venueId!) ? prev : [...prev, venueId!]
        );
      } catch {
        setSkipError({
          id: item.id,
          message: "Couldn't refresh this stop. Try again in a moment.",
        });
      } finally {
        setSkippingItemId(null);
      }
    },
    [
      generateFilters.allowedCategories,
      generateFilters.allowedNeighborhoods,
      generateFilters.hoursAhead,
      manualEntries,
      rejectedVenueIds,
    ]
  );

  return (
    <AuroraBackground variant="sanctuary">
      <HomeHeader
        userName={localUserName}
        weather={weather}
        profileImageUrl={localProfileImageUrl}
        onSettingsClick={() => setShowEditProfile(true)}
      />

      <main className="mx-auto max-w-[600px] space-y-10 px-6 pb-40 pt-28">
        {generateError && pageState === "initial" && (
          <div className="glass-panel silk-border rounded-2xl border border-primary/20 p-4">
            <p className="font-montserrat text-sm text-primary">
              {generateError}
            </p>
          </div>
        )}

        <LayoutGroup>
          <AnimatePresence mode="wait">
            {pageState === "initial" && (
              <motion.div
                key="initial"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.35 }}
                className="space-y-10"
              >
                <VibeSelector
                  vibeImageUrl={vibeImageUrl}
                  vibeImageFile={vibeImageFile}
                  onImageChange={handleImageChange}
                />
                <GeneratePlanCard
                  onGenerate={() => void handleGenerate()}
                  onManualSchedule={() => setManualSheetOpen(true)}
                  onViewDay={handleViewDay}
                  quietHours={quietHours}
                  manualEntryCount={manualEntries.length}
                  hasGeneratedPlan={generatedPlan !== null}
                />
              </motion.div>
            )}

            {pageState === "generating" && (
              <motion.div
                key="generating"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                transition={{ duration: 0.4 }}
              >
                <GenerationSequence
                  ready={apiReady}
                  onComplete={handleGenerationComplete}
                />
              </motion.div>
            )}

            {pageState === "generated" && generatedPlan && (
              <motion.div
                key="generated"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="space-y-10"
              >
                {generatedPlan.response && (
                  <motion.div variants={staggerItem}>
                    <PlanStatusBanner response={generatedPlan.response} />
                  </motion.div>
                )}
                <motion.div variants={staggerItem}>
                  <PlanTimeline
                    items={generatedPlan.timeline}
                    emptyMessage={
                      generatedPlan.response &&
                      isNoCalendarConnected(generatedPlan.response)
                        ? "Connect a calendar to see your day's rhythm"
                        : undefined
                    }
                    onSkipStop={
                      quietHours ? undefined : (item) => void handleSkipStop(item)
                    }
                    skippingId={skippingItemId}
                    skipError={skipError}
                  />
                </motion.div>
                <motion.div variants={staggerItem}>
                  <OutfitCard outfit={generatedPlan.outfit} />
                </motion.div>
                <motion.div variants={staggerItem}>
                  <VenueCarousel venues={generatedPlan.venues} />
                </motion.div>
                <motion.div variants={staggerItem}>
                  <EveningReflection />
                </motion.div>
                {quietHours && (
                  <motion.div variants={staggerItem}>
                    <PlanningQuietHoursNotice />
                  </motion.div>
                )}
                <motion.div variants={staggerItem} className="pt-2">
                  <motion.button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={quietHours}
                    whileHover={quietHours ? undefined : { scale: 1.01 }}
                    whileTap={quietHours ? undefined : { scale: 0.98 }}
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-white/60 bg-white/30 py-3.5 font-montserrat text-sm font-semibold uppercase tracking-wider text-primary backdrop-blur-md transition-colors hover:bg-white/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      refresh
                    </span>
                    Regenerate Plan
                  </motion.button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>
      </main>

      <ManualScheduleSheet
        open={manualSheetOpen}
        onClose={() => setManualSheetOpen(false)}
        entries={manualEntries}
        onSave={handleManualSave}
        quietHours={quietHours}
      />

      <BottomNav activeTab="today" />

      <EditProfileSheet
        open={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        onSaveSuccess={(updated) => {
          setLocalUserName(updated.display_name);
          setLocalProfileImageUrl(updated.avatar_url);
        }}
      />
    </AuroraBackground>
  );
}
