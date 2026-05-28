import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");

  if (error) {
    return new NextResponse(
      `
      <script>
        window.opener?.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: '${error}' }, '*');
        window.close();
      </script>
      `,
      { status: 200, headers }
    );
  }

  if (!code || !state) {
    return new NextResponse(
      `
      <script>
        window.opener?.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: 'invalid_callback' }, '*');
        window.close();
      </script>
      `,
      { status: 200, headers }
    );
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Missing Google OAuth credentials in environment variables.");
    }
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // Exchange auth code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user profile
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    // Save tokens in Supabase and mark onboarding step complete
    const supabase = createAdminClient();
    const { error: dbError } = await supabase
      .from("users")
      .update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        google_email: profile.email,
        calendar_connected: true,
        onboarding_calendar_complete: true,
      })
      .eq("id", state);

    if (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }

    return new NextResponse(
      `
      <script>
        window.opener?.postMessage({
          type: 'GOOGLE_AUTH_SUCCESS',
          email: '${profile.email || ""}',
          name: '${profile.name || ""}'
        }, '*');
        window.close();
      </script>
      `,
      { status: 200, headers }
    );
  } catch (err: any) {
    console.error("Google OAuth callback error:", err.message);
    return new NextResponse(
      `
      <script>
        window.opener?.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: 'token_exchange_failed' }, '*');
        window.close();
      </script>
      `,
      { status: 200, headers }
    );
  }
}
