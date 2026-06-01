"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard, SectionTitle, OverlineLabel } from "@/components/profile/GlassCard";
import { PillButton, PreferenceChip } from "@/components/profile/PillButton";
import { BottomSheet, GlassInput, GlassSelect } from "@/components/profile/BottomSheet";
import { cn } from "@/lib/utils/cn";
import type {
  UserProfile,
  WardrobeItem,
  ConnectedCalendar,
  DietarySettings,
  WardrobeCategory,
} from "@/lib/types/profile";

// ─── ICON SET ─────────────────────────────────────────────────────────────────
// Thin-stroke icons; on-surface color; 24px stroke
const icons = {
  Settings: () => (
    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Plus: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Heart: ({ filled }: { filled?: boolean }) => (
    <svg width="15" height="15" fill={filled ? "#e89b86" : "none"} stroke={filled ? "#8b4e3c" : "currentColor"} strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  Trash: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  ),
  ChevronRight: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Sparkle: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" />
    </svg>
  ),
  Calendar: () => (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  MapPin: () => (
    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
};

// ─── CATEGORY HELPERS ─────────────────────────────────────────────────────────
const CATEGORY_EMOJI: Record<WardrobeCategory, string> = {
  top: "👕", bottom: "👖", outerwear: "🧥",
  shoes: "👟", accessory: "💍", other: "✨",
};
const CATEGORIES: WardrobeCategory[] = ["top", "bottom", "outerwear", "shoes", "accessory", "other"];

const PROVIDER_META: Record<string, { icon: string; color: string; label: string }> = {
  google: { icon: "📅", color: "#EA4335", label: "Google Calendar" },
  icloud: { icon: "☁️", color: "#147EFB", label: "iCloud Calendar" },
  outlook: { icon: "📧", color: "#0078D4", label: "Outlook Calendar" },
};

// ─── TOAST ───────────────────────────────────────────────────────────────────
function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-[90px] left-1/2 -translate-x-1/2 z-[200] whitespace-nowrap animate-soft-rise">
      <div className="glass-modal rounded-full px-5 py-2.5 font-montserrat text-[13px] font-medium text-on-surface shadow-glow">
        {message}
      </div>
    </div>
  );
}

// ─── WARDROBE ITEM CARD ───────────────────────────────────────────────────────
function WardrobeCard({
  item,
  onFavorite,
  onDelete,
}: {
  item: WardrobeItem;
  onFavorite: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative rounded-2xl overflow-hidden border border-white/35 border-t-white/60 shadow-glow bg-white/40 backdrop-blur-[32px] animate-soft-rise">
      {/* Image or placeholder */}
      <div className="aspect-square relative overflow-hidden bg-gradient-to-br from-surface-container-low to-secondary-container/40 flex items-center justify-center">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="text-4xl opacity-60">{CATEGORY_EMOJI[item.category]}</span>
        )}

        {/* Overlay actions — appear on hover/touch */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={onFavorite}
            className="w-7 h-7 rounded-full glass-card flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
            aria-label={item.is_favorite ? "Remove from favourites" : "Add to favourites"}
          >
            <icons.Heart filled={item.is_favorite} />
          </button>
          <button
            onClick={onDelete}
            className="w-7 h-7 rounded-full glass-card flex items-center justify-center text-on-surface-variant hover:text-error transition-colors"
            aria-label="Remove item"
          >
            <icons.Trash />
          </button>
        </div>

        {/* AI-tagged badge */}
        {item.ai_tagged && (
          <div className="absolute bottom-2 left-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-tertiary-container/80 backdrop-blur-sm text-on-tertiary-container text-[10px] font-semibold font-montserrat">
              <icons.Sparkle />
              AI Tagged
            </span>
          </div>
        )}
      </div>

      {/* Name + meta */}
      <div className="p-3">
        <p className="font-montserrat text-[13px] font-semibold text-on-surface leading-tight truncate">
          {item.name}
        </p>
        {item.brand && (
          <p className="font-montserrat text-[11px] text-on-surface-variant mt-0.5">{item.brand}</p>
        )}
      </div>
    </div>
  );
}

// ─── ADD WARDROBE SHEET ───────────────────────────────────────────────────────
function AddWardrobeSheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<WardrobeItem>) => void;
}) {
  const [form, setForm] = useState({
    name: "", category: "outerwear" as WardrobeCategory,
    brand: "", color: "", image_url: "", tags: "",
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave({
      name: form.name.trim(),
      category: form.category,
      brand: form.brand || undefined,
      color: form.color || undefined,
      image_url: form.image_url || undefined,
      tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    });
    setForm({ name: "", category: "outerwear", brand: "", color: "", image_url: "", tags: "" });
    setError(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be under 5 MB.");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/wardrobe", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process photo.");
      }

      // Auto-tag mapping
      const colorStr = data.colors?.[0] || "";
      const colorCap = colorStr ? colorStr.charAt(0).toUpperCase() + colorStr.slice(1) : "";
      const catVal = (data.category || "other") as WardrobeCategory;
      const catCap = catVal.charAt(0).toUpperCase() + catVal.slice(1);
      const nameVal = colorCap ? `${colorCap} ${catCap}` : catCap;

      const tagList = [...(data.occasions || []), ...(data.seasons || [])];

      setForm({
        name: nameVal,
        category: catVal,
        brand: form.brand || "Saanjh Closet",
        color: colorCap || "",
        image_url: data.photoUrl,
        tags: tagList.join(", "),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error auto-tagging photo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Add to Wardrobe">
      <div className="flex flex-col gap-4 pb-2">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Photo Upload Area */}
        <div 
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={cn(
            "relative border-2 border-dashed border-white/40 rounded-2xl aspect-video flex flex-col items-center justify-center gap-2 cursor-pointer transition-all bg-white/20 hover:bg-white/30",
            uploading && "cursor-not-allowed bg-white/10"
          )}
        >
          {uploading ? (
            <>
              <div className="ai-shimmer pointer-events-none absolute inset-0 rounded-2xl" />
              <span className="material-symbols-outlined animate-pulse text-[28px] text-tertiary">
                auto_awesome
              </span>
              <span className="font-montserrat text-[11px] font-bold tracking-wider text-tertiary animate-pulse">
                AI Tagging Photo...
              </span>
            </>
          ) : form.image_url ? (
            <div className="relative w-full h-full rounded-2xl overflow-hidden">
              <img 
                src={form.image_url} 
                alt="Upload preview" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <span className="text-white text-xs font-semibold font-montserrat flex items-center gap-1.5 bg-black/60 px-3 py-1.5 rounded-full">
                  Change Photo
                </span>
              </div>
            </div>
          ) : (
            <>
              <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" className="text-primary/60">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span className="font-montserrat text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/80">
                Upload Local Photo
              </span>
              <span className="font-montserrat text-[9px] text-outline text-center px-4">
                AI will instantly scan your photo & auto-fill the form!
              </span>
            </>
          )}
        </div>

        {error && (
          <p className="text-center font-montserrat text-xs text-error font-medium" role="alert">
            ⚠️ {error}
          </p>
        )}

        <GlassInput label="Item Name *" placeholder="e.g. Signature Camel Coat" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={uploading} />
        
        <GlassSelect label="Category" value={form.category} disabled={uploading}
          onChange={e => setForm(f => ({ ...f, category: e.target.value as WardrobeCategory }))}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </GlassSelect>
        
        <div className="grid grid-cols-2 gap-3">
          <GlassInput label="Brand" placeholder="Zara, H&M…" value={form.brand} disabled={uploading}
            onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
          <GlassInput label="Colour" placeholder="Camel, Ivory…" value={form.color} disabled={uploading}
            onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
        </div>
        
        <GlassInput label="Image URL" placeholder="https://…" value={form.image_url} disabled={uploading}
          onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} />
        
        <GlassInput label="Tags (comma-separated)" placeholder="winter, formal, cozy" value={form.tags} disabled={uploading}
          onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
        
        <PillButton variant="primary" size="lg" className="w-full mt-2" onClick={handleSave}
          disabled={!form.name.trim() || uploading}>
          Add Item
        </PillButton>
      </div>
    </BottomSheet>
  );
}

// ─── EDIT PROFILE SHEET ───────────────────────────────────────────────────────
function EditProfileSheet({
  open,
  onClose,
  profile,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  profile: UserProfile;
  onSave: (data: Partial<UserProfile>) => void;
}) {
  const [form, setForm] = useState({
    display_name: profile.display_name,
    username: profile.username,
    bio: profile.bio ?? "",
    location: profile.location ?? "",
    avatar_url: profile.avatar_url ?? "",
  });

  return (
    <BottomSheet open={open} onClose={onClose} title="Edit Profile">
      <div className="flex flex-col gap-4 pb-2">
        <GlassInput label="Display Name" placeholder="Your name" value={form.display_name}
          onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
        <GlassInput label="Username" placeholder="@username" value={form.username}
          onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
        <GlassInput label="Bio" placeholder="A little about you…" value={form.bio}
          onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
        <GlassInput label="Location" placeholder="New Delhi, India" value={form.location}
          onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
        <GlassInput label="Avatar URL" placeholder="https://…" value={form.avatar_url}
          onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))} />
        <PillButton variant="primary" size="lg" className="w-full mt-2"
          onClick={() => onSave(form)} disabled={!form.display_name.trim()}>
          Save Changes
        </PillButton>
      </div>
    </BottomSheet>
  );
}

// ─── BOTTOM NAVIGATION ────────────────────────────────────────────────────────
function BottomNav({ active }: { active: "today" | "friends" | "profile" }) {
  const router = useRouter();
  const tabs = [
    { id: "today" as const, label: "Today", icon: "🏠", href: "/home" },
    { id: "friends" as const, label: "Friends", icon: "👥", href: "#" },
    { id: "profile" as const, label: "Profile", icon: "✨", href: "/profile" },
  ];

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-1/2 -translate-x-1/2 z-40",
        "w-full max-w-content",
        "bg-white/70 backdrop-blur-xl",
        "border-t border-white/60",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex justify-around items-center h-16 px-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => router.push(tab.href)}
            className={cn(
              "flex flex-col items-center gap-1 min-w-[44px] min-h-[44px] justify-center",
              "font-montserrat text-[10px] font-semibold tracking-wider uppercase",
              "transition-colors duration-150",
              active === tab.id ? "text-primary" : "text-outline"
            )}
          >
            <span className="text-xl">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── DEMO FALLBACK DATA ───────────────────────────────────────────────────────
const DEMO_PROFILE: UserProfile = {
  id: "demo", clerk_user_id: "demo", display_name: "Riya Sharma",
  username: "@riya.saanjh", avatar_url: null,
  bio: "Curating everyday beauty, one plan at a time ✨",
  location: "New Delhi, India", ai_integration_enabled: true,
  created_at: "", updated_at: "",
};

const DEMO_WARDROBE: WardrobeItem[] = [
  { id: "w1", user_id: "demo", name: "Signature Camel Coat", category: "outerwear", brand: "Zara", color: "Camel", image_url: null, tags: ["winter", "formal"], weather_suitability: ["cold", "mild"], vibe_tags: ["elegant"], is_favorite: true, ai_tagged: true, created_at: "" },
  { id: "w2", user_id: "demo", name: "City Runners", category: "shoes", brand: "Nike", color: "White", image_url: null, tags: ["casual", "everyday"], weather_suitability: ["all"], vibe_tags: ["sporty"], is_favorite: false, ai_tagged: true, created_at: "" },
  { id: "w3", user_id: "demo", name: "Silk Camisole", category: "top", brand: "& Other Stories", color: "Ivory", image_url: null, tags: ["summer", "date"], weather_suitability: ["hot"], vibe_tags: ["romantic"], is_favorite: true, ai_tagged: false, created_at: "" },
  { id: "w4", user_id: "demo", name: "Tailored Trousers", category: "bottom", brand: "Mango", color: "Charcoal", image_url: null, tags: ["office", "formal"], weather_suitability: ["mild", "cold"], vibe_tags: ["minimal"], is_favorite: false, ai_tagged: true, created_at: "" },
];

const DEMO_CALENDARS: ConnectedCalendar[] = [
  { id: "c1", user_id: "demo", name: "Personal iCloud", provider: "icloud", is_connected: true, last_synced_at: new Date().toISOString(), created_at: "" },
  { id: "c2", user_id: "demo", name: "Professional Google", provider: "google", is_connected: true, last_synced_at: new Date().toISOString(), created_at: "" },
];

const DEMO_DIETARY: DietarySettings = {
  id: "d1", user_id: "demo", updated_at: "",
  preferences: [
    { label: "Plant-Based Focus", icon: "🌿", is_active: true },
    { label: "Gluten Free", icon: "🌾", is_active: false },
    { label: "Dairy Free", icon: "🥛", is_active: false },
    { label: "Vegetarian", icon: "🥗", is_active: false },
    { label: "Vegan", icon: "🌱", is_active: false },
    { label: "Jain", icon: "🪷", is_active: false },
    { label: "Halal", icon: "🌙", is_active: false },
    { label: "Low Carb", icon: "⚡", is_active: false },
    { label: "Keto", icon: "🥑", is_active: false },
    { label: "Intermittent Fasting", icon: "⏰", is_active: false },
  ],
  allergies: [],
  nutrition_goal: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PROFILE PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [calendars, setCalendars] = useState<ConnectedCalendar[]>([]);
  const [dietary, setDietary] = useState<DietarySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAddWardrobe, setShowAddWardrobe] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [pRes, wRes, cRes, dRes] = await Promise.allSettled([
          fetch("/api/profile"),
          fetch("/api/wardrobe"),
          fetch("/api/calendars"),
          fetch("/api/dietary"),
        ]);

        if (pRes.status === "fulfilled" && pRes.value.ok) {
          setProfile(await pRes.value.json());
        } else setProfile(DEMO_PROFILE);

        if (wRes.status === "fulfilled" && wRes.value.ok) {
          const data = await wRes.value.json();
          setWardrobe(data.length ? data : DEMO_WARDROBE);
        } else setWardrobe(DEMO_WARDROBE);

        if (cRes.status === "fulfilled" && cRes.value.ok) {
          const data = await cRes.value.json();
          setCalendars(data.length ? data : DEMO_CALENDARS);
        } else setCalendars(DEMO_CALENDARS);

        if (dRes.status === "fulfilled" && dRes.value.ok) {
          setDietary(await dRes.value.json());
        } else setDietary(DEMO_DIETARY);
      } catch {
        setProfile(DEMO_PROFILE);
        setWardrobe(DEMO_WARDROBE);
        setCalendars(DEMO_CALENDARS);
        setDietary(DEMO_DIETARY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSaveProfile = useCallback(async (data: Partial<UserProfile>) => {
    setProfile(p => p ? { ...p, ...data } : p);
    setShowEditProfile(false);
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      showToast("Profile updated ✨");
    } catch { showToast("Saved locally"); }
  }, [showToast]);

  const handleAddWardrobe = useCallback(async (data: Partial<WardrobeItem>) => {
    const optimistic: WardrobeItem = {
      id: `temp-${Date.now()}`, user_id: "optimistic",
      name: data.name!, category: data.category ?? "other",
      brand: data.brand ?? null, color: data.color ?? null,
      image_url: data.image_url ?? null, tags: data.tags ?? [],
      weather_suitability: [], vibe_tags: [],
      is_favorite: false, ai_tagged: false, created_at: new Date().toISOString(),
    };
    setWardrobe(ws => [optimistic, ...ws]);
    setShowAddWardrobe(false);
    try {
      const res = await fetch("/api/wardrobe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const saved = await res.json();
        setWardrobe(ws => ws.map(w => w.id === optimistic.id ? saved : w));
      }
    } catch { }
    showToast("Added to wardrobe ✨");
  }, [showToast]);

  const handleToggleFavorite = useCallback(async (item: WardrobeItem) => {
    const next = !item.is_favorite;
    setWardrobe(ws => ws.map(w => w.id === item.id ? { ...w, is_favorite: next } : w));
    try {
      await fetch(`/api/wardrobe/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: next }),
      });
    } catch { }
  }, []);

  const handleDeleteWardrobe = useCallback(async (item: WardrobeItem) => {
    setWardrobe(ws => ws.filter(w => w.id !== item.id));
    try {
      await fetch(`/api/wardrobe/${item.id}`, { method: "DELETE" });
      showToast("Item removed from wardrobe");
    } catch { }
  }, [showToast]);

  const handleToggleCalendar = useCallback(async (cal: ConnectedCalendar) => {
    const next = !cal.is_connected;
    setCalendars(cs => cs.map(c => c.id === cal.id ? { ...c, is_connected: next, last_synced_at: next ? new Date().toISOString() : null } : c));
    try {
      await fetch("/api/calendars", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cal.id, is_connected: next }),
      });
      showToast(next ? `${cal.name} connected` : `${cal.name} disconnected`);
    } catch { }
  }, [showToast]);

  const handleToggleDietary = useCallback(async (label: string) => {
    if (!dietary) return;
    const updated = {
      ...dietary,
      preferences: dietary.preferences.map(p =>
        p.label === label ? { ...p, is_active: !p.is_active } : p
      ),
    };
    setDietary(updated);
    try {
      await fetch("/api/dietary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: updated.preferences }),
      });
    } catch { }
  }, [dietary]);

  // ── Time-based greeting ────────────────────────────────────────────────────
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
  })();

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="aurora-bg min-h-svh flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-soft-rise">
          <div className="w-16 h-16 rounded-full glass-ai flex items-center justify-center text-3xl">
            ✨
          </div>
          <p className="font-playfair text-lg text-on-surface-variant italic">
            Curating your sanctuary…
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="aurora-bg min-h-svh">
      <div className="page-shell pt-0">

        {/* ── TOP APP BAR ─────────────────────────────────────────── */}
        <header className="flex items-center justify-between pt-safe-area pb-2 sticky top-0 z-30 bg-transparent">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <button
              onClick={() => setShowEditProfile(true)}
              className={cn(
                "w-11 h-11 rounded-full overflow-hidden",
                "bg-gradient-to-br from-primary-container to-secondary-container",
                "ring-2 ring-primary-container flex items-center justify-center",
                "font-playfair text-lg font-semibold text-on-primary-container",
                "transition-transform duration-150 active:scale-95"
              )}
              aria-label="Edit profile"
            >
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                : profile?.display_name?.[0] ?? "S"
              }
            </button>
            <span className="font-montserrat text-[13px] text-on-surface-variant font-medium">
              {greeting}
            </span>
          </div>

          {/* Settings icon */}
          <button
            onClick={() => setShowEditProfile(true)}
            className="w-11 h-11 rounded-full glass-card flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
            aria-label="Settings"
          >
            <icons.Settings />
          </button>
        </header>

        {/* ── HERO — SANCTUARY CARD ──────────────────────────────────── */}
        <section className="mt-2 animate-soft-rise">
          <GlassCard
            level={2}
            onClick={() => setShowEditProfile(true)}
            className="relative overflow-hidden"
          >
            {/* Atmospheric orbs */}
            <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-inverse-primary/15 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-4 w-24 h-24 rounded-full bg-tertiary-container/20 blur-2xl pointer-events-none" />

            <OverlineLabel className="mb-2">My Profile</OverlineLabel>
            <h1 className="font-playfair text-[28px] font-bold leading-[1.15] text-on-surface mb-1">
              Your Personal<br />Sanctuary
            </h1>
            <p className="font-montserrat text-[13px] text-on-surface-variant mb-4">
              A mindful space for your curated life.
            </p>

            {profile?.bio && (
              <p className="font-montserrat text-[14px] text-on-surface-variant italic mb-2">
                &ldquo;{profile.bio}&rdquo;
              </p>
            )}
            {profile?.location && (
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <icons.MapPin />
                <span className="font-montserrat text-[12px]">{profile.location}</span>
              </div>
            )}
          </GlassCard>
        </section>

        {/* ── WARDROBE ─────────────────────────────────────────────── */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Wardrobe</SectionTitle>
            <div className="flex items-center gap-2">
              <PillButton
                variant="primary"
                size="sm"
                icon={<icons.Plus />}
                onClick={() => setShowAddWardrobe(true)}
              >
                Add
              </PillButton>
              <PillButton variant="secondary-glass" size="sm">
                Manage All
              </PillButton>
            </div>
          </div>

          {wardrobe.length === 0 ? (
            // Empty state
            <GlassCard className="flex flex-col items-center py-10 gap-3">
              <div className="text-5xl opacity-50">👗</div>
              <p className="font-playfair text-[18px] font-medium text-on-surface text-center">
                Your wardrobe awaits
              </p>
              <p className="font-montserrat text-[13px] text-on-surface-variant text-center max-w-[220px]">
                Add your first piece and let AI help you put together the perfect look.
              </p>
              <PillButton
                variant="primary"
                size="md"
                icon={<icons.Plus />}
                className="mt-2"
                onClick={() => setShowAddWardrobe(true)}
              >
                Add First Item
              </PillButton>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {wardrobe.map(item => (
                <WardrobeCard
                  key={item.id}
                  item={item}
                  onFavorite={() => handleToggleFavorite(item)}
                  onDelete={() => handleDeleteWardrobe(item)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── CONNECTED CALENDARS ───────────────────────────────────── */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Connected Calendars</SectionTitle>
            <PillButton variant="ghost" size="sm" icon={<icons.Plus />}>
              Add
            </PillButton>
          </div>

          <GlassCard className="p-0 overflow-hidden">
            {calendars.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2">
                <span className="text-3xl">📅</span>
                <p className="font-montserrat text-[13px] text-on-surface-variant">
                  No calendars connected yet
                </p>
              </div>
            ) : (
              <ul>
                {calendars.map((cal, i) => {
                  const meta = PROVIDER_META[cal.provider] ?? { icon: "📆", color: "#85736e", label: cal.name };
                  return (
                    <li key={cal.id}>
                      <button
                        onClick={() => handleToggleCalendar(cal)}
                        className={cn(
                          "w-full flex items-center gap-4 px-5 py-4",
                          "text-left transition-colors duration-150",
                          "hover:bg-white/30 active:bg-white/50",
                          i > 0 && "silk-divider"
                        )}
                      >
                        {/* Provider icon */}
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                          style={{ background: meta.color + "18" }}
                        >
                          {meta.icon}
                        </div>

                        {/* Name + sync */}
                        <div className="flex-1 min-w-0">
                          <p className="font-montserrat text-[14px] font-medium text-on-surface truncate">
                            {cal.name}
                          </p>
                          {cal.last_synced_at && (
                            <p className="font-montserrat text-[11px] text-outline mt-0.5">
                              Synced {new Date(cal.last_synced_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </p>
                          )}
                        </div>

                        {/* Status badge */}
                        <span
                          className={cn(
                            "font-montserrat text-[11px] font-bold px-2.5 py-1 rounded-full",
                            cal.is_connected
                              ? "bg-[#ECFDF5] text-[#065F46]"
                              : "bg-surface-container-high text-outline"
                          )}
                        >
                          {cal.is_connected ? "Active" : "Inactive"}
                        </span>

                        <icons.ChevronRight />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassCard>
        </section>

        {/* ── DIETARY PREFERENCES ───────────────────────────────────── */}
        <section className="mt-6 mb-6">
          <SectionTitle className="mb-3">Dietary Preferences</SectionTitle>

          <GlassCard>
            <div className="flex flex-wrap gap-2">
              {dietary?.preferences.map(pref => (
                <PreferenceChip
                  key={pref.label}
                  label={pref.label}
                  icon={pref.icon}
                  selected={pref.is_active}
                  onClick={() => handleToggleDietary(pref.label)}
                />
              ))}
            </div>

            {/* Allergies */}
            {dietary?.allergies && dietary.allergies.length > 0 && (
              <div className="mt-5 pt-4 silk-divider">
                <OverlineLabel className="mb-2">Allergies</OverlineLabel>
                <div className="flex flex-wrap gap-2">
                  {dietary.allergies.map(a => (
                    <span
                      key={a}
                      className="font-montserrat text-[12px] font-medium px-3 py-1 rounded-full bg-error-container text-error border border-error/20"
                    >
                      ⚠️ {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Nutrition goal nudge */}
            {dietary?.nutrition_goal && (
              <div className="mt-4 flex items-center gap-3 p-3 rounded-2xl bg-secondary-container/40 border-l-4 border-l-secondary">
                <span className="text-xl">🎯</span>
                <p className="font-montserrat text-[13px] text-on-surface">{dietary.nutrition_goal}</p>
              </div>
            )}
          </GlassCard>
        </section>

      </div>

      {/* ── BOTTOM NAVIGATION ───────────────────────────────────────── */}
      <BottomNav active="profile" />

      {/* ── SHEETS ────────────────────────────────────────────────────────── */}
      <AddWardrobeSheet
        open={showAddWardrobe}
        onClose={() => setShowAddWardrobe(false)}
        onSave={handleAddWardrobe}
      />
      {profile && (
        <EditProfileSheet
          open={showEditProfile}
          onClose={() => setShowEditProfile(false)}
          profile={profile}
          onSave={handleSaveProfile}
        />
      )}

      {/* ── TOAST ─────────────────────────────────────────────────────── */}
      <Toast message={toast} />
    </div>
  );
}
