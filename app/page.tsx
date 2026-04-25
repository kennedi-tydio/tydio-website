import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import WhyTydio from "./components/WhyTydio";
import Pricing from "./components/Pricing";
import Waitlist from "./components/Waitlist";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <HowItWorks />
        <WhyTydio />
        <Pricing />
        <Waitlist />
      </main>
      <Footer />
    </>
  );
}
