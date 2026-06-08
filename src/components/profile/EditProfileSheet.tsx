"use client";

import { useState, useEffect } from "react";
import { SignOutButton } from "@clerk/nextjs";
import { BottomSheet, GlassInput } from "@/components/profile/BottomSheet";
import { PillButton } from "@/components/profile/PillButton";
import type { UserProfile } from "@/lib/types/profile";

export function EditProfileSheet({
  open,
  onClose,
  onSaveSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSaveSuccess?: (updated: UserProfile) => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    display_name: "",
    username: "",
    bio: "",
    location: "",
    avatar_url: "",
  });

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError(null);
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setProfile(data);
          setForm({
            display_name: data.display_name || "",
            username: data.username || "",
            bio: data.bio ?? "",
            location: data.location ?? "",
            avatar_url: data.avatar_url ?? "",
          });
        }
      })
      .catch((err) => console.error("Failed to load profile in settings:", err))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSave = async () => {
    if (!form.display_name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        if (onSaveSuccess) {
          onSaveSuccess(updated);
        }
        onClose();
      } else {
        const errData = await res.json().catch(() => null);
        setError(errData?.error || "Failed to save profile changes.");
      }
    } catch (err) {
      console.error("Failed to save profile:", err);
      setError("An unexpected error occurred while saving.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Edit Profile">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="font-montserrat text-xs text-on-surface-variant/70">Loading settings…</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          {/* Profile Avatar & Header Info */}
          <div className="flex flex-col items-center gap-2.5 py-1">
            <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-white/50 shadow-md bg-white/10">
              {form.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.avatar_url}
                  alt={form.display_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary/10 font-playfair text-2xl font-semibold text-primary">
                  {form.display_name ? form.display_name.charAt(0).toUpperCase() : "?"}
                </div>
              )}
            </div>
            <div className="text-center">
              <h4 className="font-playfair text-base font-bold text-on-surface">
                {form.display_name || "Anonymous User"}
              </h4>
              {form.username && (
                <p className="font-montserrat text-xs text-on-surface-variant/70">
                  @{form.username.replace(/^@/, "")}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <GlassInput
              label="Display Name"
              placeholder="Your name"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              disabled={saving}
            />
            <GlassInput
              label="Username"
              placeholder="@username"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              disabled={saving}
            />
          </div>

          <GlassInput
            label="Email Address"
            value={profile?.email || "No email available"}
            disabled
            className="opacity-60 cursor-not-allowed bg-black/5"
          />

          <GlassInput
            label="Bio"
            placeholder="A little about you…"
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            disabled={saving}
          />
          <GlassInput
            label="Location"
            placeholder="New Delhi, India"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            disabled={saving}
          />
          <GlassInput
            label="Avatar URL"
            placeholder="https://…"
            value={form.avatar_url}
            onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
            disabled={saving}
          />

          {error && (
            <p className="text-center font-montserrat text-xs text-error font-medium" role="alert">
              ⚠️ {error}
            </p>
          )}

          <div className="flex flex-col gap-2.5 mt-3 pt-3 border-t border-white/10">
            <PillButton
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleSave}
              disabled={!form.display_name.trim() || saving}
            >
              {saving ? "Saving Changes…" : "Save Changes"}
            </PillButton>

            <SignOutButton redirectUrl="/sign-in">
              <PillButton variant="destructive" size="lg" className="w-full" disabled={saving}>
                Logout
              </PillButton>
            </SignOutButton>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
