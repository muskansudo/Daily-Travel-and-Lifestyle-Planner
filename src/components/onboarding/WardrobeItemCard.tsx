"use client";

import Image from "next/image";
import { CATEGORY_LABEL, COLOR_SWATCH, OCCASION_LABEL, SEASON_LABEL} from "@/lib/constants/wardrobe";
import type { WardrobeItemDTO } from "@/lib/types/wardrobe";
import { cn } from "@/lib/utils/cn";

export function WardrobeItemCard({
  item,
  onToggleFavorite,
  onDelete,
  pending = false,
}: {
  item: WardrobeItemDTO;
  onToggleFavorite: () => void;
  onDelete: () => void;
  pending?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative aspect-square overflow-hidden rounded-2xl border border-white/40 bg-white/30 shadow-glow backdrop-blur-xl transition-opacity",
        pending && "opacity-60"
      )}
    >
      {/* Photo */}
      <Image
        src={item.photoUrl}
        alt={item.category ? CATEGORY_LABEL[item.category] : "Wardrobe item"}
        fill
        className="object-cover"
        sizes="(max-width: 540px) 45vw, 240px"
      />

      {/* Top gradient scrim for badge legibility */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/30 to-transparent"
        aria-hidden
      />

      {/* Category badge (top-left) */}
      {item.category && (
        <span className="absolute left-2 top-2 rounded-full bg-white/85 px-2.5 py-1 font-montserrat text-[10px] font-semibold uppercase tracking-wider text-on-surface backdrop-blur-sm">
          {CATEGORY_LABEL[item.category]}
        </span>
      )}
      {/* Occasion + season badges */}
<div className="absolute left-2 top-10 flex max-w-[75%] flex-wrap gap-1">
  {item.occasions.slice(0, 2).map((occasion) => (
    <span
      key={occasion}
      className="rounded-full bg-white/80 px-2 py-0.5 font-montserrat text-[8px] font-semibold uppercase tracking-wider text-on-surface backdrop-blur-sm"
    >
      {OCCASION_LABEL[occasion]}
    </span>
  ))}

  {item.seasons.slice(0, 2).map((season) => (
    <span
      key={season}
      className="rounded-full bg-white/80 px-2 py-0.5 font-montserrat text-[8px] font-semibold uppercase tracking-wider text-on-surface backdrop-blur-sm"
    >
      {SEASON_LABEL[season]}
    </span>
  ))}
</div>
      {/* Favorite heart (top-right) */}
      <button
        type="button"
        onClick={onToggleFavorite}
        disabled={pending}
        className={cn(
  "absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/50 shadow-sm backdrop-blur-sm transition-all hover:scale-105",
  item.isFavorite
    ? "bg-red-100 text-red-500"
    : "bg-white/70 text-primary"
)}
        aria-label={item.isFavorite ? "Unfavourite" : "Favourite"}
        aria-pressed={item.isFavorite}
      >
        <span
          className={cn(
  "material-symbols-outlined text-[18px] transition-colors",
  item.isFavorite ? "text-red-500" : "text-primary"
)}
          style={{
            fontVariationSettings: item.isFavorite ? "'FILL' 1" : "'FILL' 0",
          }}
        >
          favorite
        </span>
      </button>

      {/* Bottom strip: color dots + delete */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/40 to-transparent px-2.5 pb-2 pt-6">
        <div className="flex items-center gap-1">
          {item.colors.slice(0, 3).map((c) => (
            <span
              key={c}
              className="h-3 w-3 rounded-full border border-white/70 shadow-sm"
              style={{ backgroundColor: COLOR_SWATCH[c] ?? "#cccccc" }}
              title={c}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/50 bg-white/60 text-on-surface-variant backdrop-blur-sm transition hover:bg-white/80 hover:text-error"
          aria-label="Remove item"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {!item.aiTagged && (
        <div className="absolute inset-x-0 bottom-9 flex justify-center">
          <span className="rounded-full bg-tertiary-container/70 px-2 py-0.5 font-montserrat text-[9px] font-semibold uppercase tracking-wider text-on-surface backdrop-blur-sm">
            Tag manually
          </span>
        </div>
      )}
    </div>
  );
}
