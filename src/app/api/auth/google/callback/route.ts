import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  calendarOAuthReturnUrl,
  getGoogleRedirectUri,
} from "@/lib/env/google";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      calendarOAuthReturnUrl(request, {
        google: "error",
        reason: error,
      })
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      calendarOAuthReturnUrl(request, {
        google: "error",
        reason: "invalid_callback",
      })
    );
  }

  try {
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

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    const supabase = createAdminClient();
    const updateData: Record<string, unknown> = {
      google_access_token: tokens.access_token,
      google_token_expiry: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      google_email: profile.email,
      calendar_connected: true,
      onboarding_calendar_complete: true,
    };

    if (tokens.refresh_token) {
      updateData.google_refresh_token = tokens.refresh_token;
    }

    const { error: dbError } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", state);

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    return NextResponse.redirect(
      calendarOAuthReturnUrl(request, {
        google: "success",
        email: profile.email ?? "",
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "token_exchange_failed";
    console.error("Google OAuth callback error:", message);
    return NextResponse.redirect(
      calendarOAuthReturnUrl(request, {
        google: "error",
        reason: "token_exchange_failed",
      })
    );
  }
}
