import { SignUp } from "@clerk/nextjs";
import { AuroraBackground } from "@/components/ui/AuroraBackground";

export default function SignUpPage() {
  return (
    <AuroraBackground>
      <main className="mx-auto flex min-h-dvh max-w-[680px] items-center justify-center px-5 py-10 sm:px-6">
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          forceRedirectUrl="/onboarding/profile"
          appearance={{
            elements: {
              card: "rounded-[28px] border border-white/50 bg-white/85 p-7 shadow-[0_20px_60px_rgba(41,26,18,0.12)] backdrop-blur-xl sm:p-8",
              headerTitle: "text-3xl font-semibold tracking-tight text-slate-900",
              headerSubtitle: "text-sm text-slate-600",
              socialButtonsBlockButton:
                "rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium shadow-sm transition hover:border-slate-300 hover:bg-slate-50",
              dividerLine: "bg-slate-200",
              dividerText: "text-xs text-slate-400",
              formFieldLabel: "text-sm font-medium text-slate-700",
              formFieldInput:
                "rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 ring-[#8b4e3c]/20 transition placeholder:text-slate-400 focus:border-[#8b4e3c] focus:ring-4",
              formButtonPrimary:
                "rounded-xl bg-gradient-to-r from-[#111827] to-[#0f2347] py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:brightness-110",
              footerActionLink: "font-medium text-slate-900 underline",
            },
          }}
        />
      </main>
    </AuroraBackground>
  );
}
