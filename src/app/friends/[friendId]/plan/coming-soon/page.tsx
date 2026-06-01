export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function PlanComingSoonPage({
  params,
}: {
  params: { friendId: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  redirect(`/friends/${params.friendId}/plan`);
}
