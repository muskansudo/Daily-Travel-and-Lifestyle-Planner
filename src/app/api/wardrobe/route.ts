import { NextResponse } from "next/server";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { tagWardrobeImage } from "@/lib/ai/vision";
import type { WardrobeItem, WardrobeCategory, WeatherSuitability } from "@/lib/types/profile";

const BUCKET = "wardrobe-photos";
const MAX_BYTES = 5 * 1024 * 1024;

function mapDbToWardrobeItem(row: any): WardrobeItem {
  const colorStr = row.colors?.[0] || "";
  const colorCap = colorStr ? colorStr.charAt(0).toUpperCase() + colorStr.slice(1) : "";
  const catCap = row.category ? row.category.charAt(0).toUpperCase() + row.category.slice(1) : "Item";
  
  // Format beautifully: e.g. "Black Coat" or "Camel Outerwear"
  const name = colorCap ? `${colorCap} ${catCap}` : catCap;

  const tags = [...(row.occasions || []), ...(row.seasons || [])];
  
  let weather_suitability: WeatherSuitability[] = ["all"];
  if (row.seasons?.includes("winter")) {
    weather_suitability = ["cold", "mild"];
  } else if (row.seasons?.includes("summer")) {
    weather_suitability = ["hot"];
  }

  const vibe_tags = row.occasions?.includes("formal")
    ? ["elegant"]
    : row.occasions?.includes("work")
    ? ["minimal"]
    : ["casual"];

  return {
    id: row.id,
    user_id: row.user_id,
    name,
    category: (row.category || "other") as WardrobeCategory,
    brand: "Saanjh Closet",
    color: colorStr || null,
    image_url: row.photo_url,
    tags,
    weather_suitability,
    vibe_tags,
    is_favorite: row.is_favorite || false,
    ai_tagged: row.ai_tagged || false,
    created_at: row.created_at,
  };
}

export async function GET() {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getOrCreateDbUser(clerkId);
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("wardrobe_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mapped = (data || []).map(mapDbToWardrobeItem);
    return NextResponse.json(mapped);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getOrCreateDbUser(clerkId);
    const supabase = createAdminClient();
    const contentType = request.headers.get("content-type") || "";

    // ──────────────────────────────────────────────────────────────────────────
    // CASE A: Direct Local File Upload (with AI auto-tagging)
    // ──────────────────────────────────────────────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "File must be an image" }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;

      // 1. Upload to storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);

      // 2. Run AI vision tagger
      const tags = await tagWardrobeImage(buffer, file.type);

      // 3. Return the publicUrl and suggested AI tags for frontend auto-population!
      return NextResponse.json({
        photoUrl: publicUrl,
        category: tags.category,
        colors: tags.colors,
        occasions: tags.occasions,
        seasons: tags.seasons,
        aiTagged: tags.aiTagged,
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CASE B: Manual JSON Submission (pasting external URL)
    // ──────────────────────────────────────────────────────────────────────────
    const body = await request.json();
    const category = body.category || "other";
    const color = body.color ? body.color.trim().toLowerCase() : "";
    const colors = color ? [color] : [];
    
    const tags = body.tags || [];
    const occasions = tags.filter((t: string) =>
      ["casual", "work", "festive", "loungewear", "formal", "workout"].includes(t.toLowerCase())
    );
    const seasons = tags.filter((t: string) =>
      ["summer", "monsoon", "winter", "all_season"].includes(t.toLowerCase())
    );

    const fallbackImage = "https://images.unsplash.com/photo-1595777457583-95e059d581b8?q=80&w=300";
    const photo_url = body.image_url || fallbackImage;

    // Insert manually defined wardrobe item row
    const { data, error } = await supabase
      .from("wardrobe_items")
      .insert({
        user_id: user.id,
        photo_url,
        photo_path: "", // manually added via profile does not have raw path
        category,
        colors,
        occasions: occasions.length ? occasions : ["casual"],
        seasons: seasons.length ? seasons : ["all_season"],
        is_favorite: false,
        ai_tagged: false,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(mapDbToWardrobeItem(data));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
