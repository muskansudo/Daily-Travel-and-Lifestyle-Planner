export const dynamic = "force-dynamic";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getOrCreateDbUser } from "@/lib/auth";
import { FriendsPageClient } from "@/components/friends/FriendsPageClient";

export default async function FriendsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await getOrCreateDbUser(userId);
  const clerkUser = await currentUser();

  return (
    <FriendsPageClient
      userName={user.display_name ?? clerkUser?.firstName ?? "there"}
      profileImageUrl={clerkUser?.imageUrl ?? null}
    />
  );
}
