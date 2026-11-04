// A redirect target that came from the URL or a form. Only same-site paths pass:
// "//evil.com" and "/\evil.com" start with "/" but browsers treat them as
// another host, which would turn our login page into a phishing redirect.
export function safeRedirectPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/')) return null
  if (next.startsWith('//') || next.startsWith('/\\')) return null
  if (/[\u0000-\u001f]/.test(next)) return null
  return next
}
