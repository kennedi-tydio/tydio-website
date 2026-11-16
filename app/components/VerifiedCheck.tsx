// The green checkmark shown beside a Tidy Pro an admin has verified
// (tidypro_profiles.is_verified). Not the same as Top Tidy Pro, which is
// earned from ratings and bookings.
export function VerifiedCheck({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#22c55e"
      stroke="white"
      strokeWidth="1.5"
      role="img"
      aria-label="Verified"
      className={`flex-shrink-0 ${className}`}
    >
      <title>Verified</title>
      <circle cx="12" cy="12" r="10" />
      <path d="M7.5 12.5l2.8 2.8 6.2-6.6" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
