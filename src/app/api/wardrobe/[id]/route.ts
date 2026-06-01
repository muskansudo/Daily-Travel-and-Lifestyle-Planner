import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "wardrobe-photos";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const user = await getOrCreateDbUser(clerkId);
    const supabase = createAdminClient();

    const updates: Record<string, unknown> = {};
    if (body.is_favorite !== undefined) updates.is_favorite = body.is_favorite;
    if (body.category !== undefined) updates.category = body.category;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("wardrobe_items")
      .update(updates)
      .eq("id", params.id)
      .eq("user_id", user.id) // ownership guard
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getOrCreateDbUser(clerkId);
    const supabase = createAdminClient();

    // Fetch first to see if there is a photo_path to clean up from storage
    const { data: item, error: fetchError } = await supabase
      .from("wardrobe_items")
      .select("id, photo_path")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("wardrobe_items")
      .delete()
      .eq("id", params.id)
      .eq("user_id", user.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Clean up Supabase storage photo if there was a photo_path saved
    if (item.photo_path) {
      await supabase.storage.from(BUCKET).remove([item.photo_path]);
    }

    return NextResponse.json({ deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
