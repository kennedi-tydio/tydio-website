import { getSession } from "@/lib/auth/session";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import WhyTydio from "./components/WhyTydio";
import Pricing from "./components/Pricing";
import FAQ from "./components/FAQ";
import ReadyToBookCta from "./components/ReadyToBookCta";
import Footer from "./components/Footer";
import ChatbaseScript from "./components/ChatbaseScript";

export default async function Home() {
  // The chatbot is for visitors; anyone signed in is in the app.
  const session = await getSession();
  const signedIn = session != null;

  return (
    <>
      <Navbar />
      <main id="main-content">
        <Hero />
        <HowItWorks />
        <WhyTydio />
        <Pricing />
        <FAQ />
        <ReadyToBookCta role={session?.role ?? null} />
      </main>
      <Footer />
      {!signedIn && <ChatbaseScript />}
    </>
  );
}
