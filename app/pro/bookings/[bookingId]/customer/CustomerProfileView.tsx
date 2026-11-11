'use client'

import { useRouter } from '@/app/components/NavigationSpinner'
import { IconBack } from '../TaskListView'
import type { CustomerPetWithPhoto } from '@/lib/customerPetsData'

function IconStar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#f5a623" stroke="#f5a623" strokeWidth="1">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

export default function CustomerProfileView({
  name,
  photoUrl,
  pets,
  hasNoPets,
  memberSince,
  rating,
  reviewCount,
}: {
  name: string
  photoUrl: string | null
  pets: CustomerPetWithPhoto[]
  hasNoPets: boolean
  memberSince: string | null
  rating: number
  reviewCount: number
}) {
  const router = useRouter()

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <IconBack />
        </button>

        <div className="flex flex-col items-center text-center mb-6">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={name} className="w-24 h-24 rounded-full object-cover mb-3" />
          ) : (
            <div className="w-24 h-24 rounded-full flex items-center justify-center bg-slate-100 text-slate-500 font-bold text-3xl mb-3">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-bold text-slate-900">{name}</h1>
          {memberSince && (
            <p className="text-sm text-slate-400 mt-1">
              Member since {new Date(memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4 mb-4">
          <h2 className="font-semibold text-slate-900 mb-1.5">Rating from Tidy Pros</h2>
          {reviewCount > 0 ? (
            <div className="flex items-center gap-1.5">
              <IconStar />
              <span className="text-sm font-semibold text-slate-800">{rating.toFixed(1)}</span>
              <span className="text-sm text-slate-400">
                {reviewCount} review{reviewCount === 1 ? '' : 's'}
              </span>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No reviews yet</p>
          )}
        </div>

        {(pets.length > 0 || hasNoPets) && (
          <div className="border-t border-slate-100 pt-4">
            <h2 className="font-semibold text-slate-900 mb-1.5">Pets</h2>
            {pets.length === 0 ? (
              <p className="text-sm text-slate-600">No pets</p>
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
        )}
      </div>
    </main>
  )
}
