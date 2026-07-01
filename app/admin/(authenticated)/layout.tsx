import { redirect } from 'next/navigation'
import { isAdminAuthed } from '@/lib/auth/admin'
import { adminLogoutAction } from '../actions'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin — Tydio' }

const NAV_ITEMS = [
  { label: 'Overview', href: '/admin' },
  { label: 'Service Areas', href: '/admin/service-areas' },
  { label: 'Users', href: '/admin/users' },
]

export default async function AdminAuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const authed = await isAdminAuthed()
  if (!authed) redirect('/admin/login')

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-52 bg-white border-r border-slate-100 flex flex-col fixed inset-y-0 left-0 z-10">
        <div className="px-5 py-4 border-b border-slate-100 flex items-baseline gap-1.5">
          <span className="text-base font-bold" style={{ color: '#38C7CA' }}>Tydio</span>
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Admin</span>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t border-slate-100">
          <form action={adminLogoutAction}>
            <button
              type="submit"
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      {/* Main content */}
      <main className="flex-1 ml-52 p-8 min-h-screen">
        {children}
      </main>
    </div>
  )
}
