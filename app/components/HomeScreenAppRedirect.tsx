// The marketing homepage is for the website. Opened as the home-screen app
// (an icon added from this page, or before the manifest's start_url was
// /login, still opens here), go straight to /login instead. Signed-in people
// are sent on from /login to their own Home by proxy.ts, so "Stay signed in"
// opens the app right on Home.
//
// An inline script, not an effect, so it runs while the page is still loading
// and the website never flashes up first.
const SCRIPT = `try{if(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true){window.location.replace('/login')}}catch(e){}`

export default function HomeScreenAppRedirect() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
