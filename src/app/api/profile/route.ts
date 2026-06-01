import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserProfile } from "@/lib/types/profile";

export async function GET() {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getOrCreateDbUser(clerkId);
    
    const userProfile: UserProfile = {
      id: user.id,
      clerk_user_id: user.clerk_id,
      display_name: user.display_name || "",
      username: user.username || "",
      avatar_url: user.profile_photo_url || null,
      bio: (user as any).bio || null,
      location: user.city || "Delhi",
      ai_integration_enabled: true,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    return NextResponse.json(userProfile);
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
    const user = await getOrCreateDbUser(clerkId);
    const supabase = createAdminClient();

    const updates: Record<string, unknown> = {};
    if (body.display_name !== undefined) updates.display_name = body.display_name;
    if (body.username !== undefined) updates.username = body.username;
    if (body.avatar_url !== undefined) updates.profile_photo_url = body.avatar_url;
    if (body.bio !== undefined) updates.bio = body.bio;
    if (body.location !== undefined) updates.city = body.location;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
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

    const updatedProfile: UserProfile = {
      id: data.id,
      clerk_user_id: data.clerk_id,
      display_name: data.display_name || "",
      username: data.username || "",
      avatar_url: data.profile_photo_url || null,
      bio: data.bio || null,
      location: data.city || "Delhi",
      ai_integration_enabled: true,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };

    return NextResponse.json(updatedProfile);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
