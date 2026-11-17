import { redirect } from 'next/navigation'

// Work photos are managed on the Edit Profile page now. Kept so old links and
// bookmarks still land in the right place.
export default function ProPortfolioPage() {
  redirect('/pro/profile/edit#cleaning-photos')
}
