import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const LIFESTYLE_MAPPING = [
  { id: "active", label: "Active", icon: "⚡" },
  { id: "relaxed", label: "Relaxed", icon: "🧘" },
  { id: "social", label: "Social", icon: "🗣️" },
  { id: "focused", label: "Focused", icon: "🎯" },
  { id: "adventurous", label: "Adventurous", icon: "🧗" },
  { id: "minimalist", label: "Minimalist", icon: "🌿" },
];

export async function GET() {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getOrCreateDbUser(clerkId);
    const userTags = user.lifestyle_tags || [];
    const preferences = LIFESTYLE_MAPPING.map((p) => ({
      id: p.id,
      label: p.label,
      icon: p.icon,
      is_active: userTags.includes(p.id) || userTags.includes(p.label) || userTags.includes(p.label.toLowerCase()),
    }));
    return NextResponse.json({ preferences });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { preferences } = body;
    if (!Array.isArray(preferences)) {
      return NextResponse.json({ error: "Preferences must be an array" }, { status: 400 });
    }

    const user = await getOrCreateDbUser(clerkId);
    const supabase = createAdminClient();

    const activeIds = preferences
      .filter((p: any) => p && p.is_active)
      .map((p: any) => {
        const match = LIFESTYLE_MAPPING.find(m => m.id === p.id || m.label === p.label);
        return match ? match.id : null;
      })
      .filter((id): id is string => id !== null);

    const { data, error } = await supabase
      .from("users")
      .update({ lifestyle_tags: activeIds })
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const userTags = data.lifestyle_tags || [];
    const updatedPreferences = LIFESTYLE_MAPPING.map((p) => ({
      id: p.id,
      label: p.label,
      icon: p.icon,
      is_active: userTags.includes(p.id),
    }));

    return NextResponse.json({ preferences: updatedPreferences });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
