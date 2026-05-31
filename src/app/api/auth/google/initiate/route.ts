import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getOrCreateDbUser, requireAuth } from "@/lib/auth";
import {
  calendarOAuthReturnUrl,
  getGoogleRedirectUri,
} from "@/lib/env/google";

const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export async function GET(request: NextRequest) {
  const clerkId = await requireAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await getOrCreateDbUser(clerkId);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Missing Google OAuth credentials in environment variables.");
    }

    const redirectUri = getGoogleRedirectUri();

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
      state: user.id,
    });

    if (request.nextUrl.searchParams.get("redirect") === "1") {
      return NextResponse.redirect(url);
    }

    return NextResponse.json({ url, redirectUri });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
