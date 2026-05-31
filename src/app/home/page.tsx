export const dynamic = "force-dynamic";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getOrCreateDbUser } from "@/lib/auth";
import { HomePageClient } from "@/components/home/HomePageClient";

export default async function HomePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await getOrCreateDbUser(userId);
  const clerkUser = await currentUser();

  return (
    <HomePageClient
      userName={user.display_name ?? clerkUser?.firstName ?? "there"}
      profileImageUrl={clerkUser?.imageUrl ?? null}
    />
  );
}
