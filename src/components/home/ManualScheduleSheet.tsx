"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ManualScheduleEntry } from "@/lib/types/home";
import { PlanningQuietHoursNotice } from "@/components/planning/PlanningQuietHoursNotice";
import {
  backdropVariants,
  sheetVariants,
  staggerContainer,
  staggerItem,
} from "./animations";

const EMPTY_ENTRY = (): ManualScheduleEntry => ({
  id: crypto.randomUUID(),
  startTime: "",
  endTime: "",
  activity: "",
  explanation: "",
});

function isValidEntry(entry: ManualScheduleEntry): boolean {
  return Boolean(
    entry.startTime &&
      entry.endTime &&
      entry.startTime !== entry.endTime &&
      entry.activity.trim()
  );
}

export function ManualScheduleSheet({
  open,
  onClose,
  entries,
  onSave,
  quietHours = false,
}: {
  open: boolean;
  onClose: () => void;
  entries: ManualScheduleEntry[];
  onSave: (entries: ManualScheduleEntry[]) => void;
  quietHours?: boolean;
}) {
  const [localEntries, setLocalEntries] = useState<ManualScheduleEntry[]>(entries);

  useEffect(() => {
    if (open) {
      setLocalEntries(entries);
    }
  }, [open, entries]);

  const updateEntry = (
    id: string,
    field: keyof ManualScheduleEntry,
    value: string
  ) => {
    setLocalEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const addEntry = () => {
    setLocalEntries((prev) => [...prev, EMPTY_ENTRY()]);
  };

  const removeEntry = (id: string) => {
    const next = localEntries.filter((e) => e.id !== id);
    setLocalEntries(next);
    // Persist immediately so the saved count always reflects what's on screen.
    // Without this, deleting a window then closing via the X (which doesn't
    // save) leaves a stale "1 manual commitment saved" on the home screen.
    onSave(next.filter(isValidEntry));
  };

  const handleSave = () => {
    const valid = localEntries.filter(isValidEntry);
    onSave(valid);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-h-[85dvh] max-w-[600px] overflow-hidden rounded-t-3xl border border-white/40 bg-surface/95 shadow-glow-lg backdrop-blur-2xl"
          >
            <div className="flex justify-center py-3">
              <div className="h-1 w-10 rounded-full bg-outline-variant/60" />
            </div>

            <div className="flex items-center justify-between px-6 pb-4">
              <div>
                <h2 className="font-playfair text-xl font-semibold text-on-surface">
                  Manual Schedule
                </h2>
                <p className="mt-0.5 font-montserrat text-xs text-on-surface-variant">
                  Block out when you&apos;re busy — use start and end times
                  (overnight OK, e.g. 22:00 to 06:00)
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={onClose}
                className="rounded-full p-2 hover:bg-white/20"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-on-surface-variant">
                  close
                </span>
              </motion.button>
            </div>

            {quietHours && (
              <div className="px-6 pb-4">
                <PlanningQuietHoursNotice variant="inline" />
              </div>
            )}

            <div className="no-scrollbar max-h-[50dvh] overflow-y-auto px-6 pb-4">
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="space-y-4"
              >
                {localEntries.length === 0 && (
                  <p className="py-6 text-center font-montserrat text-sm text-on-surface-variant/70">
                    No busy windows yet. Add one below, or save to clear your
                    manual schedule.
                  </p>
                )}
                {localEntries.map((entry) => (
                  <motion.div
                    key={entry.id}
                    variants={staggerItem}
                    layout
                    className="glass-panel rounded-xl p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-montserrat text-xs font-semibold uppercase tracking-wider text-primary">
                        Busy window
                      </span>
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        className="text-on-surface-variant/60 hover:text-error"
                        aria-label="Remove busy window"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          delete
                        </span>
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                          <span className="mb-1.5 block font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                            From
                          </span>
                          <input
                            type="time"
                            value={entry.startTime}
                            onChange={(e) =>
                              updateEntry(entry.id, "startTime", e.target.value)
                            }
                            className="w-full rounded-xl border border-white/40 bg-white/20 px-4 py-3 font-montserrat text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                            To
                          </span>
                          <input
                            type="time"
                            value={entry.endTime}
                            onChange={(e) =>
                              updateEntry(entry.id, "endTime", e.target.value)
                            }
                            className="w-full rounded-xl border border-white/40 bg-white/20 px-4 py-3 font-montserrat text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </label>
                      </div>
                      <input
                        type="text"
                        placeholder="Activity (e.g. Class, Meeting, Sleep)"
                        value={entry.activity}
                        onChange={(e) =>
                          updateEntry(entry.id, "activity", e.target.value)
                        }
                        className="w-full rounded-xl border border-white/40 bg-white/20 px-4 py-3 font-montserrat text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <input
                        type="text"
                        placeholder="Optional note"
                        value={entry.explanation ?? ""}
                        onChange={(e) =>
                          updateEntry(entry.id, "explanation", e.target.value)
                        }
                        className="w-full rounded-xl border border-white/40 bg-white/20 px-4 py-3 font-montserrat text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              <motion.button
                type="button"
                onClick={addEntry}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-primary/30 py-3 font-montserrat text-sm font-semibold text-primary hover:bg-primary/5"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                {localEntries.length === 0 ? "Add a window" : "Add another window"}
              </motion.button>
            </div>

            <div className="border-t border-white/20 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <motion.button
                type="button"
                onClick={handleSave}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="btn-premium w-full rounded-full py-4 font-montserrat text-sm font-semibold uppercase tracking-wider"
              >
                Save Schedule
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
