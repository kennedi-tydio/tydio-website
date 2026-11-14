'use client'

// Jumps to another FAQ question and opens it. Browsers don't reliably expand a
// closed <details> when its id is the link target.
export default function FaqLink({ target, children }: { target: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${target}`}
      onClick={() => {
        const el = document.getElementById(target)
        if (el instanceof HTMLDetailsElement) el.open = true
      }}
      className="text-sky-600 underline underline-offset-2"
    >
      {children}
    </a>
  )
}
