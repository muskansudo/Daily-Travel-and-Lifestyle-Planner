import type { NextRequest } from "next/server";

export function getGoogleRedirectUri(): string {
  if (process.env.GOOGLE_REDIRECT_URI?.trim()) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");

  return `${appUrl}/api/auth/google/callback`;
}

export function calendarOAuthReturnUrl(
  request: NextRequest,
  params: Record<string, string>
) {
  const url = new URL("/oauth/google/complete", request.url);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url;
}
