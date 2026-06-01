import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConnectedCalendar } from "@/lib/types/profile";

export async function GET() {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getOrCreateDbUser(clerkId);
    
    const googleCal: ConnectedCalendar = {
      id: "google",
      user_id: user.id,
      name: user.google_email || "Professional Google",
      provider: "google",
      is_connected: user.calendar_connected || false,
      last_synced_at: user.calendar_connected ? user.updated_at : null,
      created_at: user.created_at,
    };

    const icloudCal: ConnectedCalendar = {
      id: "icloud",
      user_id: user.id,
      name: "iCloud Calendar (Coming Soon)",
      provider: "icloud",
      is_connected: false,
      last_synced_at: null,
      created_at: user.created_at,
    };

    // Return only these two; icloud is marked as "Coming Soon" (is_connected: false)
    return NextResponse.json([googleCal, icloudCal]);
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
    const { id, is_connected } = body;
    const user = await getOrCreateDbUser(clerkId);
    const supabase = createAdminClient();

    if (id === "icloud") {
      return NextResponse.json({ error: "iCloud Calendar is coming soon!" }, { status: 400 });
    }

    if (id === "google") {
      const { data, error } = await supabase
        .from("users")
        .update({ calendar_connected: is_connected })
        .eq("id", user.id)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const googleCal: ConnectedCalendar = {
        id: "google",
        user_id: data.id,
        name: data.google_email || "Professional Google",
        provider: "google",
        is_connected: data.calendar_connected,
        last_synced_at: data.calendar_connected ? data.updated_at : null,
        created_at: data.created_at,
      };

      return NextResponse.json(googleCal);
    }

    return NextResponse.json({ error: "Invalid calendar provider" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
