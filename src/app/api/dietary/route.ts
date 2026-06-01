import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DietarySettings, DietaryPreference } from "@/lib/types/profile";

const STANDARD_PREFERENCES = [
  { label: "Plant-Based Focus", icon: "🌿" },
  { label: "Gluten Free", icon: "🌾" },
  { label: "Dairy Free", icon: "🥛" },
  { label: "Vegetarian", icon: "🥗" },
  { label: "Vegan", icon: "🌱" },
  { label: "Jain", icon: "🪷" },
  { label: "Halal", icon: "🌙" },
  { label: "Low Carb", icon: "⚡" },
  { label: "Keto", icon: "🥑" },
  { label: "Intermittent Fasting", icon: "⏰" },
];

function buildDietarySettings(user: any): DietarySettings {
  const userTags = user.dietary_tags || [];
  
  const preferences: DietaryPreference[] = STANDARD_PREFERENCES.map((p) => ({
    label: p.label,
    icon: p.icon,
    is_active: userTags.includes(p.label),
  }));

  return {
    id: "dietary-" + user.id,
    user_id: user.id,
    preferences,
    allergies: [], // standard onboarding schema does not specify individual allergy fields yet
    nutrition_goal: null,
    updated_at: user.updated_at,
  };
}

export async function GET() {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getOrCreateDbUser(clerkId);
    return NextResponse.json(buildDietarySettings(user));
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

    // Extract labels of active preferences
    const activeTags = preferences
      .filter((p: any) => p && p.is_active)
      .map((p: any) => p.label);

    const { data, error } = await supabase
      .from("users")
      .update({ dietary_tags: activeTags })
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(buildDietarySettings(data));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
