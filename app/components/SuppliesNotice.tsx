// Tells the Tidy Pro whether the customer is supplying the cleaning supplies:
// green when they are, red when the Tidy Pro has to bring their own. Shown on
// every screen before they arrive so they know whether to bring supplies.
export default function SuppliesNotice({
  provided,
  past = false,
  className = '',
}: {
  provided: boolean
  // A finished booking: worded in the past tense.
  past?: boolean
  className?: string
}) {
  const text = past
    ? provided
      ? 'Cleaning supplies were provided'
      : 'Cleaning supplies were not provided'
    : provided
      ? 'Cleaning supplies will be provided'
      : 'Cleaning supplies will not be provided'
  return <p className={`text-sm font-bold ${provided ? 'text-green-700' : 'text-red-600'} ${className}`}>{text}</p>
}
