export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SharedPlansPageClient } from "@/components/friends/SharedPlansPageClient";

export default async function SharedPlansPage({
  params,
}: {
  params: { friendId: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return <SharedPlansPageClient friendId={params.friendId} />;
}
