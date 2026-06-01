export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SharedPlanDetailPageClient } from "@/components/friends/SharedPlanDetailPageClient";

export default async function SharedPlanDetailPage({
  params,
}: {
  params: { friendId: string; planId: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <SharedPlanDetailPageClient
      friendId={params.friendId}
      planId={params.planId}
    />
  );
}
