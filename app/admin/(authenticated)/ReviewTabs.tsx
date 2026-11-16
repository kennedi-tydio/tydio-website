import Link from 'next/link'

// The Open / Resolved filter above the cancellations and reports tables.
export default function ReviewTabs({
  basePath,
  current,
  tabs,
  params = {},
}: {
  basePath: string
  current: string
  tabs: { value: string; label: string; count: number }[]
  // Other filters on the page, kept when switching tabs.
  params?: Record<string, string>
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={`${basePath}?${new URLSearchParams({ ...params, tab: t.value })}`}
          aria-current={current === t.value ? 'page' : undefined}
          className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
            current === t.value ? 'bg-brand text-white border-brand' : 'border-slate-200 text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.label} ({t.count})
        </Link>
      ))}
    </div>
  )
}
