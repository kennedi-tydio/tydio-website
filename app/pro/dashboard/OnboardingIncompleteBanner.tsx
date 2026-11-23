// Shown at the top of the dashboard until the cleaner has passed their background
// check and finished every onboarding item, since until then customers can't book them.
//
// When the only thing left is pricing Standard / Deep Cleaning, they can still
// be booked for everything else, so the banner says just that.
export default function OnboardingIncompleteBanner({ fullServiceOnly = false }: { fullServiceOnly?: boolean }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 mb-6 flex items-start gap-3">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <p className="text-sm text-red-700 leading-relaxed">
        {fullServiceOnly
          ? 'You won’t receive Standard or Deep Cleaning requests until you set your prices below. If you don’t offer them, remove them from Services Provided.'
          : 'You won’t be able to accept bookings until you complete all of your onboarding items below.'}
      </p>
    </div>
  )
}
