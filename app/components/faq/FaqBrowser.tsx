'use client'

import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import InstallDemo from '../InstallDemo'
import {
  ANDROID_INSTALL_STEPS,
  FAQ_CATEGORIES,
  FAQ_CONTACT_EMAIL,
  IPHONE_INSTALL_STEPS,
  faqSearchText,
  matchesFaqQuery,
  type FaqBlock,
  type FaqItem,
} from './faqContent'

// With this many results or fewer, they open on their own so the answer is
// right there.
const AUTO_OPEN_MAX = 2

// Opens a question by id and scrolls to it. Browsers don't reliably expand a
// closed <details> when its id is the link target.
function openQuestion(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  if (el instanceof HTMLDetailsElement) el.open = true
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Answer({
  blocks,
  linkHref,
  onLink,
}: {
  blocks: FaqBlock[]
  linkHref: (target: string) => string
  onLink: (target: string) => void
}) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'p':
            return <p key={i}>{block.text}</p>
          case 'note':
            return <p key={i} className="text-sm">{block.text}</p>
          case 'steps':
            return (
              <ol key={i} className="list-decimal pl-5 flex flex-col gap-2">
                {block.items.map(item => <li key={item}>{item}</li>)}
              </ol>
            )
          case 'list':
            return (
              <ul key={i} className="list-disc pl-5 flex flex-col gap-2">
                {block.items.map(item => <li key={item}>{item}</li>)}
              </ul>
            )
          case 'link':
            return (
              <p key={i}>
                {block.before && <>{block.before} </>}
                <a
                  href={linkHref(block.target)}
                  onClick={e => {
                    if (!linkHref(block.target).startsWith('#')) return
                    e.preventDefault()
                    onLink(block.target)
                  }}
                  className="text-sky-600 underline underline-offset-2"
                >
                  {block.label}
                </a>
              </p>
            )
          case 'install-demo':
            return (
              <InstallDemo
                key={i}
                ios={{
                  steps: IPHONE_INSTALL_STEPS,
                  note: 'Push notifications need iOS 16.4 or later. You can update in Settings → General → Software Update.',
                }}
                android={{
                  steps: ANDROID_INSTALL_STEPS,
                  note: 'Using Samsung Internet? Tap the menu button (☰) at the bottom right, then Add page to → Home screen → Add.',
                }}
              />
            )
        }
      })}
    </>
  )
}

function Question({
  item,
  defaultOpen,
  linkHref,
  onLink,
}: {
  item: FaqItem
  defaultOpen: boolean
  linkHref: (target: string) => string
  onLink: (target: string) => void
}) {
  return (
    <details id={item.id} open={defaultOpen || undefined} className="group scroll-mt-24 border-b border-slate-200 py-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        {item.question}
        <svg
          aria-hidden="true"
          className="w-5 h-5 flex-none text-slate-400 transition-transform group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="mt-4 flex flex-col gap-4 text-slate-600">
        <Answer blocks={item.answer} linkHref={linkHref} onLink={onLink} />
      </div>
    </details>
  )
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
    </svg>
  )
}

const inputClass =
  'w-full rounded-full border border-slate-200 bg-white py-3 pl-12 pr-4 text-base text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'

// The full, searchable FAQ on /faq.
export function FaqBrowser({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery)

  const indexed = useMemo(
    () =>
      FAQ_CATEGORIES.map(category => ({
        category,
        items: category.items.map(item => ({ item, text: faqSearchText(item, category) })),
      })),
    [],
  )

  const trimmed = query.trim()
  const results = indexed
    .map(({ category, items }) => ({
      category,
      items: trimmed ? items.filter(({ text }) => matchesFaqQuery(text, trimmed)).map(({ item }) => item) : items.map(({ item }) => item),
    }))
    .filter(({ items }) => items.length > 0)
  const resultCount = results.reduce((n, { items }) => n + items.length, 0)
  const autoOpen = trimmed !== '' && resultCount <= AUTO_OPEN_MAX

  // Open the question in the URL hash (e.g. /faq#cancel-booking).
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id) openQuestion(id)
  }, [])

  // Clear the search first so the linked question is on the page to open.
  function handleLink(target: string) {
    flushSync(() => setQuery(''))
    openQuestion(target)
    history.replaceState(null, '', `#${target}`)
  }

  return (
    <div>
      <form role="search" onSubmit={e => e.preventDefault()} className="relative mb-4">
        <label htmlFor="faq-search" className="sr-only">Search the FAQ</label>
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center"><SearchIcon /></span>
        <input
          id="faq-search"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search questions, like “cancel” or “tip”"
          autoComplete="off"
          className={inputClass}
        />
      </form>

      <p aria-live="polite" className="text-sm text-slate-400 mb-6 min-h-5">
        {trimmed ? `${resultCount} ${resultCount === 1 ? 'result' : 'results'} for “${trimmed}”` : ''}
      </p>

      {!trimmed && (
        <nav aria-label="FAQ topics" className="flex flex-wrap gap-2 mb-10">
          {FAQ_CATEGORIES.map(category => (
            <a
              key={category.id}
              href={`#${category.id}`}
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors"
            >
              {category.title}
            </a>
          ))}
        </nav>
      )}

      {resultCount === 0 ? (
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-8 text-center">
          <p className="font-semibold text-slate-900">No questions match “{trimmed}”</p>
          <p className="mt-2 text-slate-500">
            Try another word, or email us at{' '}
            <a href={`mailto:${FAQ_CONTACT_EMAIL}`} className="text-sky-600 underline underline-offset-2">{FAQ_CONTACT_EMAIL}</a>.
          </p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="mt-4 text-sm font-semibold text-sky-600 hover:text-sky-700"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          {results.map(({ category, items }) => (
            <section key={category.id} id={category.id} aria-labelledby={`${category.id}-title`} className="scroll-mt-24">
              <h2 id={`${category.id}-title`} className="text-sm font-semibold uppercase tracking-widest text-sky-500 mb-2">
                {category.title}
              </h2>
              <div className="border-t border-slate-200">
                {items.map(item => (
                  <Question
                    // Remount when auto-open changes so the open state follows it.
                    key={`${item.id}-${autoOpen}`}
                    item={item}
                    defaultOpen={autoOpen}
                    linkHref={target => `#${target}`}
                    onLink={handleLink}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

// The home page's short list: a few common questions, and a search box that
// goes to /faq.
export function FeaturedFaq({ ids }: { ids: string[] }) {
  const all = FAQ_CATEGORIES.flatMap(category => category.items)
  const items = ids.map(id => all.find(item => item.id === id)).filter((item): item is FaqItem => item != null)
  const shown = new Set(ids)

  return (
    <div>
      <form role="search" action="/faq" method="get" className="relative mb-8">
        <label htmlFor="home-faq-search" className="sr-only">Search the FAQ</label>
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center"><SearchIcon /></span>
        <input
          id="home-faq-search"
          name="q"
          type="search"
          placeholder="Search all questions"
          autoComplete="off"
          className={inputClass}
        />
      </form>

      <div className="border-t border-slate-200">
        {items.map(item => (
          <Question
            key={item.id}
            item={item}
            defaultOpen={false}
            linkHref={target => (shown.has(target) ? `#${target}` : `/faq#${target}`)}
            onLink={openQuestion}
          />
        ))}
      </div>
    </div>
  )
}
