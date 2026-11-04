// A banner across the top of the customer or Tidy Pro area, for account problems
// that limit what they can do but still let them in: a suspension, or a denied
// background check that's open to appeal.
export default function AccountNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="bg-red-50 border-b border-red-100 px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <p className="text-sm font-semibold text-red-700">{title}</p>
        <p className="text-sm text-red-600 leading-relaxed">{children}</p>
      </div>
    </div>
  )
}
