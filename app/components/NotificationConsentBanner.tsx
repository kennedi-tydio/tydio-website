import Link from 'next/link'

type Props = {
  smsConsent: 'opted_in' | 'declined' | null
  pushConsent: 'opted_in' | 'declined' | null
  notificationsHref: string
}

export default function NotificationConsentBanner({ smsConsent, pushConsent, notificationsHref }: Props) {
  const smsDeclined = smsConsent === 'declined'
  const pushDeclined = pushConsent === 'declined'
  if (!smsDeclined && !pushDeclined) return null

  const label =
    smsDeclined && pushDeclined
      ? 'Turn on text and push notifications'
      : smsDeclined
        ? 'Turn on text notifications'
        : 'Turn on push notifications'

  return (
    <Link
      href={notificationsHref}
      className="block px-4 py-2.5 text-center text-xs font-semibold text-white"
      style={{ backgroundColor: 'var(--color-brand)' }}
    >
      {label} to stay updated on your bookings →
    </Link>
  )
}
