"use client";

import { SignOutButton, UserButton } from "@clerk/nextjs";

export function UserMenu() {
  return (
    <div className="flex items-center gap-2">
      <SignOutButton redirectUrl="/sign-in">
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Logout
        </button>
      </SignOutButton>
      <UserButton afterSignOutUrl="/sign-in" />
    </div>
  );
}
