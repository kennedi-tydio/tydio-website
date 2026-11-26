'use client'

import { useState, useTransition } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import {
  FULL_SERVICE_LABEL,
  MAX_ROOM_QTY,
  ROOM_TYPES,
  SERVICE_SCOPE,
  type FullServiceScope,
  type FullServiceSelection,
  type RoomTypeKey,
} from '@/lib/fullService'
import WizardFrame, { Stepper } from '../WizardFrame'
import { saveFullServiceStepAction } from '../actions'
import { actionErrorMessage } from '@/lib/networkError'

export default function ScopeStep({ selection }: { selection: FullServiceSelection }) {
  const router = useRouter()
  const [scope, setScope] = useState<FullServiceScope>(selection.scope)
  const [rooms, setRooms] = useState<Partial<Record<RoomTypeKey, number>>>(selection.rooms)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const roomCount = Object.values(rooms).reduce((s, n) => s + (n ?? 0), 0)
  const label = FULL_SERVICE_LABEL[selection.type]

  function handleContinue() {
    setError(null)
    if (scope === 'rooms' && roomCount === 0) {
      setError('Choose at least one room.')
      return
    }
    startTransition(async () => {
      try {
        const result = await saveFullServiceStepAction({ scope, rooms }, 'priorities')
        if (result.error) setError(result.error)
        else router.push('/book/full-service/priorities')
      } catch (err) {
        setError(actionErrorMessage(err))
      }
    })
  }

  const option = (value: FullServiceScope, title: string, body: string) => (
    <label
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 cursor-pointer ${
        scope === value ? 'border-brand bg-[#f0fafa]' : 'border-slate-100'
      }`}
    >
      <input
        type="radio"
        name="scope"
        checked={scope === value}
        onChange={() => {
          setScope(value)
          setError(null)
        }}
        className="mt-1 accent-[var(--color-brand)]"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{body}</span>
      </span>
    </label>
  )

  return (
    <WizardFrame
      type={selection.type}
      step="scope"
      backHref="/dashboard"
      title={`What should your ${label} cover?`}
      description="Each Tidy Pro sets their own price, adjusted for your home's size. You'll compare them before you book."
      onContinue={handleContinue}
      pending={pending}
      error={error}
    >
      <fieldset className="flex flex-col gap-3 mb-6">
        <legend className="sr-only">What to clean</legend>
        {option('entire_home', 'Entire Home', 'Every room in your home.')}
        {option('rooms', 'Specific Rooms', 'Choose the rooms and how many of each.')}
      </fieldset>

      {scope === 'rooms' && (
        <div className="flex flex-col divide-y divide-slate-100 border border-slate-100 rounded-2xl mb-6">
          {ROOM_TYPES.map((room) => (
            <div key={room.key} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slate-800">{room.label}</span>
              <Stepper
                label={room.plural}
                value={rooms[room.key] ?? 0}
                max={MAX_ROOM_QTY}
                onChange={(n) => {
                  setError(null)
                  setRooms((prev) => ({ ...prev, [room.key]: n }))
                }}
              />
            </div>
          ))}
        </div>
      )}

      <details className="rounded-2xl bg-slate-50 px-4 py-3">
        <summary className="text-sm font-semibold text-slate-800 cursor-pointer">What&apos;s included in {label}</summary>
        <ul className="list-disc pl-4 mt-2 text-xs text-slate-600 leading-relaxed">
          {SERVICE_SCOPE[selection.type].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 mt-2">
          Inside the refrigerator, oven, cabinets, and drawers are paid add-ons. You can choose them in a later step.
        </p>
      </details>
    </WizardFrame>
  )
}
