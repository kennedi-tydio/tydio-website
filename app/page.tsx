import { cookies } from "next/headers";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import WhyTydio from "./components/WhyTydio";
import Pricing from "./components/Pricing";
import Waitlist from "./components/Waitlist";
import Footer from "./components/Footer";
import ChatbaseScript from "./components/ChatbaseScript";

export default async function Home() {
  // The chatbot is for visitors; anyone with a session cookie is in the app.
  const signedIn = (await cookies()).has("tydio_session");

  return (
    <>
      <Navbar />
      <main id="main-content">
        <Hero />
        <HowItWorks />
        <WhyTydio />
        <Pricing />
        <Waitlist />
      </main>
      <Footer />
      {!signedIn && <ChatbaseScript />}
    </>
  );
}
