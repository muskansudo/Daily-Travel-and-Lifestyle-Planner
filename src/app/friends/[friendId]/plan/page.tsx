export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CollabPlanPageClient } from "@/components/friends/CollabPlanPageClient";

export default async function CollabPlanPage({
  params,
}: {
  params: { friendId: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <CollabPlanPageClient friendId={params.friendId} />;
}
