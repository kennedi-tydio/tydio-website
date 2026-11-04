'use client'

import { useEffect } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'

// A cleaner can switch away to complete Checkr's form and come back to this page
// still open — refreshing picks up any status change recorded in the meantime.
export default function RefreshOnFocus() {
  const router = useRouter()

  useEffect(() => {
    const handleFocus = () => router.refresh()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [router])

  return null
}
