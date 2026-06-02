import { cn } from "@/lib/utils/cn";

export function FriendAvatar({
  displayName,
  profilePhotoUrl,
  size = "md",
  className,
  grayscale,
}: {
  displayName: string | null;
  profilePhotoUrl: string | null;
  size?: "sm" | "md";
  className?: string;
  grayscale?: boolean;
}) {
  const name = displayName?.trim() || "?";
  const dim = size === "sm" ? "h-10 w-10" : "h-14 w-14";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-full border-2 border-white/80 shadow-sm",
        dim,
        grayscale && "opacity-90 grayscale",
        className
      )}
    >
      {profilePhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profilePhotoUrl}
          alt={name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-primary/10 font-playfair text-lg font-semibold text-primary">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}
