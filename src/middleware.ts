import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/env/clerk";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/setup",
  "/api/webhooks(.*)",
  "/api/auth/google/callback",
]);

const clerkHandler = clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) {
    return NextResponse.next();
  }

  const { userId } = await auth();
  if (!userId) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("redirect_url", request.url);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
});

export default function middleware(
  request: NextRequest,
  event: Parameters<typeof clerkHandler>[1]
) {
  const { pathname } = request.nextUrl;

  if (!isClerkConfigured()) {
    if (pathname === "/setup") return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  return clerkHandler(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
