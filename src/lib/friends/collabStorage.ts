import type { SharedFreeTimeWindow } from "@/lib/types/friends";

/** Session key for passing today's shared windows into collaborative plan generation. */
export function collabWindowsStorageKey(friendId: string): string {
  return `saanjh-collab-windows-${friendId}`;
}

export function saveCollabWindows(
  friendId: string,
  windows: SharedFreeTimeWindow[]
): void {
  try {
    sessionStorage.setItem(
      collabWindowsStorageKey(friendId),
      JSON.stringify(windows)
    );
  } catch {
    // Ignore quota / private mode.
  }
}

export function loadCollabWindows(
  friendId: string
): SharedFreeTimeWindow[] | null {
  try {
    const raw = sessionStorage.getItem(collabWindowsStorageKey(friendId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SharedFreeTimeWindow[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
