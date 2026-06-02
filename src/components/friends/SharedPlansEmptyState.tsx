import Link from "next/link";

export function SharedPlansEmptyState({
  friendName,
  onLetsPlan,
}: {
  friendName: string;
  onLetsPlan?: () => void;
}) {
  return (
    <div className="glass-panel silk-border rounded-2xl px-6 py-10 text-center">
      <span
        className="material-symbols-outlined mb-3 text-[40px] text-primary/60"
        style={{ fontVariationSettings: '"FILL" 1' }}
      >
        auto_awesome
      </span>
      <h3 className="font-playfair text-xl font-semibold text-on-surface">
        No shared plans yet
      </h3>
      <p className="mt-2 font-montserrat text-sm text-on-surface-variant/80">
        Plans you create together with {friendName} will appear here. For now,
        check compatibility and save a time window for the upcoming AI flow.
      </p>
      {onLetsPlan ? (
        <button
          type="button"
          onClick={onLetsPlan}
          className="btn-premium mt-6 inline-flex rounded-full px-8 py-3 font-montserrat text-xs font-semibold uppercase tracking-wider"
        >
          Let&apos;s Plan
        </button>
      ) : (
        <Link
          href="/friends"
          className="btn-premium mt-6 inline-flex rounded-full px-8 py-3 font-montserrat text-xs font-semibold uppercase tracking-wider"
        >
          Back to Friends
        </Link>
      )}
    </div>
  );
}
