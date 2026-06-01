import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { preferencesSchema } from "@/lib/validations/onboarding";

export async function GET() {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getOrCreateDbUser(clerkId);
    return NextResponse.json({
      dietaryTags: user.dietary_tags,
      lifestyleTags: user.lifestyle_tags,
      interestTags: user.interest_tags,
      onboardingPreferencesComplete: user.onboarding_preferences_complete,
    });
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

    // Standard options IDs from constants
    const {
      DIETARY_OPTIONS,
      LIFESTYLE_OPTIONS,
      INTEREST_OPTIONS,
    } = require("@/lib/constants/preferences");
    
    const dietaryIds = DIETARY_OPTIONS.map((o: any) => o.id);
    const lifestyleIds = LIFESTYLE_OPTIONS.map((o: any) => o.id);
    const interestIds = INTEREST_OPTIONS.map((o: any) => o.id);

    const normalizeTag = (tag: any, allowedIds: string[]) => {
      if (typeof tag !== "string") return null;
      const lower = tag.toLowerCase().trim();
      if (allowedIds.includes(lower)) return lower;
      
      // Try replacing spaces and hyphens with underscores
      const snake = lower.replace(/[\s-]+/g, "_");
      if (allowedIds.includes(snake)) return snake;
      
      return null;
    };

    const sanitizeTags = (tags: any, allowed: string[]) => {
      if (!Array.isArray(tags)) return [];
      return tags
        .map(t => normalizeTag(t, allowed))
        .filter((t): t is string => t !== null);
    };

    if (body.dietaryTags) body.dietaryTags = sanitizeTags(body.dietaryTags, dietaryIds);
    if (body.lifestyleTags) body.lifestyleTags = sanitizeTags(body.lifestyleTags, lifestyleIds);
    if (body.interestTags) body.interestTags = sanitizeTags(body.interestTags, interestIds);

    console.log("Onboarding Preferences PATCH Normalized Body:", body);

    const parsed = preferencesSchema.safeParse(body);

    if (!parsed.success) {
      const fs = require("fs");
      fs.writeFileSync("zod-error.log", JSON.stringify({
        body,
        errors: parsed.error.flatten()
      }, null, 2));
      console.error("Zod Validation Failed. Errors:", JSON.stringify(parsed.error.flatten(), null, 2));
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      dietaryTags,
      lifestyleTags,
      interestTags,
      skip,
    } = parsed.data;

    const user = await getOrCreateDbUser(clerkId);
    const supabase = createAdminClient();

    const updates: Record<string, unknown> = {
      onboarding_preferences_complete: true,
    };

    if (!skip) {
      updates.dietary_tags = dietaryTags;
      updates.lifestyle_tags = lifestyleTags;
      updates.interest_tags = interestTags;
    }

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      user: {
        dietaryTags: data.dietary_tags,
        lifestyleTags: data.lifestyle_tags,
        interestTags: data.interest_tags,
        onboardingPreferencesComplete: data.onboarding_preferences_complete,
      },
      nextPath: "/onboarding/calendar",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
