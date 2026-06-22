"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function CompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const status = searchParams.get("google") ?? "error";
    const email = searchParams.get("email") ?? "";
    const reason = searchParams.get("reason") ?? "";

    // Popup case: notify the opener tab, then close this window.
    if (window.opener && window.opener !== window) {
      window.opener.postMessage(
        { source: "saanjh-gcal", status, email, reason },
        window.location.origin
      );
      window.close();
      return;
    }

    // Fallback (not opened as a popup): behave like the old redirect flow.
    const params = new URLSearchParams();
    params.set("google", status);
    if (email) params.set("email", email);
    if (reason) params.set("reason", reason);
    router.replace(`/onboarding/calendar?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface font-montserrat text-on-surface-variant">
      Finishing up… you can close this window.
    </div>
  );
}

export default function GoogleOAuthCompletePage() {
  return (
    <Suspense fallback={null}>
      <CompleteContent />
    </Suspense>
  );
}
