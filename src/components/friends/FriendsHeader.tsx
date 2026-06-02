"use client";

import type { WeatherInfo } from "@/lib/types/home";
import { HomeHeader } from "@/components/home/HomeHeader";

export function FriendsHeader({
  userName,
  weather,
  profileImageUrl,
}: {
  userName: string;
  weather?: WeatherInfo | null;
  profileImageUrl?: string | null;
}) {
  return (
    <HomeHeader
      userName={userName}
      weather={weather}
      profileImageUrl={profileImageUrl}
    />
  );
}
