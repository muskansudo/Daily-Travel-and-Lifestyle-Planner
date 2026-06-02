"use client";

import { motion } from "framer-motion";
import type { FriendSummary } from "@/lib/types/friends";
import { staggerContainer, staggerItem } from "@/components/home/animations";
import { FriendCard } from "./FriendCard";

export function FriendsList({
  friends,
  onLetsPlan,
  onViewSharedPlans,
  onExpenses,
  onRemove,
  removingId,
}: {
  friends: FriendSummary[];
  onLetsPlan: (friend: FriendSummary) => void;
  onViewSharedPlans: (friend: FriendSummary) => void;
  onExpenses: (friend: FriendSummary) => void;
  onRemove: (friend: FriendSummary) => void;
  removingId: string | null;
}) {
  return (
    <motion.ul
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex list-none flex-col gap-6 p-0"
    >
      {friends.map((friend) => (
        <motion.li key={friend.id} variants={staggerItem} className="list-none">
          <FriendCard
            friend={friend}
            onLetsPlan={onLetsPlan}
            onViewSharedPlans={onViewSharedPlans}
            onExpenses={onExpenses}
            onRemove={onRemove}
            removing={removingId === friend.id}
          />
        </motion.li>
      ))}
    </motion.ul>
  );
}
