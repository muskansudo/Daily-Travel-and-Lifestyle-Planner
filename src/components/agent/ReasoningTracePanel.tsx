"use client";

// ReasoningTracePanel
//
// Right-side drawer that opens automatically when a disruption fires and
// streams the agent's reasoning line by line via the SSE endpoint. This is
// the demo-winning artifact — judges watch the agent think on screen.
//
// Visual treatment per line category:
//   observation  → slate/gray text    "the world told us X"
//   decision     → indigo (tertiary)  "we concluded Y"
//   action       → terracotta (primary) "we did Z"
//   result       → green              "it worked / partial / failed"
//
// The component manages its own stream state. The parent passes:
//   - eventId + plan when a disruption fires (triggers stream)
//   - onRepairComplete(repairedPlan, result) when the stream ends
//   - onClose when the X button is tapped

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { RepairResult, ReasoningLine } from "@/lib/agent/types";
import type { PlanGenerateResponse } from "@/lib/home/generatePlan";

interface ReasoningTracePanelProps {
  open: boolean;
  eventId: string | null;
  plan: PlanGenerateResponse | null;
  onRepairComplete: (
    repairedPlan: PlanGenerateResponse,
    result: RepairResult
  ) => void;
  onClose: () => void;
}

type StreamStatus = "idle" | "streaming" | "done" | "error";

const categoryStyle: Record<
  ReasoningLine["category"],
  { color: string; label: string }
> = {
  observation: { color: "text-on-surface-variant", label: "obs" },
  decision: { color: "text-tertiary", label: "decide" },
  action: { color: "text-primary", label: "act" },
  result: { color: "text-green-700", label: "result" },
};

export function ReasoningTracePanel({
  open,
  eventId,
  plan,
  onRepairComplete,
  onClose,
}: ReasoningTracePanelProps) {
  const [lines, setLines] = useState<ReasoningLine[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom whenever a new line arrives.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  // Start streaming when eventId + plan become available.
  useEffect(() => {
    if (!open || !eventId || !plan) return;

    // Cancel any previous stream.
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setLines([]);
    setStatus("streaming");
    setError(null);

    void (async () => {
      try {
        const res = await fetch(`/api/agent/stream/${eventId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream failed: ${res.status}`);
        }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += dec.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const dataLine = part.startsWith("data: ")
              ? part.slice(6)
              : part;
            if (!dataLine.trim()) continue;

            try {
              const frame = JSON.parse(dataLine) as {
                kind: "line" | "done" | "error";
                line?: ReasoningLine;
                result?: RepairResult;
                repairedPlan?: PlanGenerateResponse;
                message?: string;
              };

              if (frame.kind === "line" && frame.line) {
                setLines((prev) => [...prev, frame.line!]);
              } else if (
                frame.kind === "done" &&
                frame.result &&
                frame.repairedPlan
              ) {
                setStatus("done");
                onRepairComplete(frame.repairedPlan, frame.result);
              } else if (frame.kind === "error") {
                throw new Error(frame.message ?? "Stream error");
              }
            } catch {
              // Malformed frame — skip silently.
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setStatus("error");
        setError((e as Error).message ?? "Unknown error");
      }
    })();

    return () => {
      abort.abort();
    };
  }, [open, eventId, plan, onRepairComplete]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-surface shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                <span className="font-montserrat text-xs font-semibold uppercase tracking-widest text-on-surface">
                  Agent reasoning
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">
                  close
                </span>
              </button>
            </div>

            {/* Trace lines */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {lines.length === 0 && status === "streaming" && (
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <span className="material-symbols-outlined animate-spin text-[18px]">
                    progress_activity
                  </span>
                  <span className="font-montserrat text-xs">
                    Evaluating your plan...
                  </span>
                </div>
              )}

              {lines.map((line, i) => {
                const style = categoryStyle[line.category];
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex gap-2.5"
                  >
                    <span
                      className={`font-montserrat text-[10px] font-semibold uppercase tracking-wider pt-0.5 w-12 shrink-0 ${style.color}`}
                    >
                      {style.label}
                    </span>
                    <p
                      className={`font-montserrat text-xs leading-relaxed ${style.color}`}
                    >
                      {line.text}
                    </p>
                  </motion.div>
                );
              })}

              {status === "done" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 rounded-xl bg-surface-container p-3 text-center"
                >
                  <p className="font-montserrat text-xs text-on-surface-variant">
                    Repair complete — see the diff below
                  </p>
                </motion.div>
              )}

              {status === "error" && (
                <div className="rounded-xl bg-error-container p-3">
                  <p className="font-montserrat text-xs text-error">
                    {error ?? "Something went wrong. Try again."}
                  </p>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
