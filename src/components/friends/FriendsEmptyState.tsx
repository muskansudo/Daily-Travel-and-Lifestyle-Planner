export function FriendsEmptyState({ onAddFriend }: { onAddFriend: () => void }) {
  return (
    <div className="glass-panel silk-border rounded-2xl px-6 py-10 text-center">
      <span
        className="material-symbols-outlined mb-3 text-[40px] text-primary/60"
        style={{ fontVariationSettings: '"FILL" 0' }}
      >
        group
      </span>
      <h3 className="font-playfair text-xl font-semibold text-on-surface">
        Your circle is quiet
      </h3>
      <p className="mt-2 font-montserrat text-sm text-on-surface-variant/80">
        Search by display name and add someone instantly — no friend requests.
      </p>
      <button
        type="button"
        onClick={onAddFriend}
        className="btn-premium mt-6 inline-flex rounded-full px-8 py-3 font-montserrat text-xs font-semibold uppercase tracking-wider"
      >
        Add a Friend
      </button>
    </div>
  );
}
