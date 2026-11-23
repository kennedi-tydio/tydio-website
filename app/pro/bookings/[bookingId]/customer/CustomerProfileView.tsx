'use client'

import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import type { CustomerPetWithPhoto } from '@/lib/customerPetsData'

function IconStar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#f5a623" stroke="#f5a623" strokeWidth="1">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

// What a Tidy Pro sees about a customer who has booked them. Laid out like a Tidy
// Pro's profile (CleanerDetailView), with the customer's own sections.
export default function CustomerProfileView({
  name,
  photoUrl,
  bio,
  preferences,
  pets,
  hasNoPets,
  memberSince,
  rating,
  reviewCount,
  reviewsHref,
}: {
  name: string
  photoUrl: string | null
  bio: string | null
  preferences: string | null
  pets: CustomerPetWithPhoto[]
  hasNoPets: boolean
  memberSince: string | null
  rating: number
  reviewCount: number
  reviewsHref: string
}) {
  const router = useRouter()
  const firstName = name.split(' ')[0]
  const initials = name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto max-w-sm mx-auto w-full pb-16">
        {/* Hero photo */}
        <div className="relative h-56 bg-slate-200 flex-shrink-0">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-brand)' }}>
              <span className="text-white text-4xl font-bold">{initials || '?'}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 pt-5">
          <h1 className="text-2xl font-bold text-slate-900">{name}</h1>
          {memberSince && (
            <p className="text-sm text-slate-400 mt-1 mb-4">
              Member since {new Date(memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          )}

          <div className="border-t border-slate-100 pt-4 mb-4">
            <h2 className="font-semibold text-slate-900 mb-1.5">About</h2>
            {bio ? (
              <p className="text-sm text-slate-500 leading-relaxed whitespace-pre-line break-words">{bio}</p>
            ) : (
              <p className="text-sm text-slate-400">{firstName} hasn&apos;t written a bio yet</p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 mb-4">
            <h2 className="font-semibold text-slate-900 mb-1.5">Preferences</h2>
            {preferences ? (
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line break-words">{preferences}</p>
            ) : (
              <p className="text-sm text-slate-400">No preferences listed</p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 mb-4">
            <Link href={reviewsHref} className="block">
              <div className="w-full flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Reviews from Tidy Pros</h2>
                <IconChevronRight />
              </div>
              {reviewCount > 0 ? (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <IconStar />
                  <span className="text-sm font-semibold text-slate-800">{rating.toFixed(1)}</span>
                  <span className="text-sm text-slate-400">
                    {reviewCount} review{reviewCount === 1 ? '' : 's'}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-slate-400 mt-1.5">No reviews yet</p>
              )}
            </Link>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h2 className="font-semibold text-slate-900 mb-1.5">Pets</h2>
            {pets.length === 0 ? (
              <p className="text-sm text-slate-600">{hasNoPets ? 'No pets' : 'No pets listed'}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {pets.map((p) => (
                  <li key={p.id} className="flex items-start gap-3">
                    {p.photoUrl ? (
                      // Signed storage URL, so a plain img rather than next/image.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photoUrl} alt={p.name ? `Photo of ${p.name}` : `Photo of ${p.petType}`} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-slate-100" />
                    ) : null}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        {p.name || p.petType}
                        {p.name && <span className="font-normal text-slate-400"> · {p.petType}</span>}
                      </p>
                      {p.notes && <p className="text-sm text-slate-600 whitespace-pre-line break-words">{p.notes}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
