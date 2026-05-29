import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ClerkUserEvent = {
  data: {
    id: string;
    username?: string | null;
    email_addresses?: { email_address: string; id: string }[];
    primary_email_address_id?: string | null;
  };
  type: string;
};

export async function POST(request: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "CLERK_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await request.text();
  const wh = new Webhook(webhookSecret);

  let event: ClerkUserEvent;
  try {
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkUserEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (event.type === "user.created" || event.type === "user.updated") {
    const clerkId = event.data.id;
    const primaryId = event.data.primary_email_address_id;
    const username = event.data.username?.toLowerCase() ?? null;
    const email =
      event.data.email_addresses?.find((e) => e.id === primaryId)
        ?.email_address ?? null;

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_id", clerkId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("users")
        .update({ email, username })
        .eq("clerk_id", clerkId);
    } else {
      await supabase.from("users").insert({
        clerk_id: clerkId,
        email,
        username,
      });
    }
  }

  if (event.type === "user.deleted") {
    await supabase.from("users").delete().eq("clerk_id", event.data.id);
  }

  return NextResponse.json({ received: true });
}
