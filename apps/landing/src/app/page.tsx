import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Features } from "@/components/features";
import { Pricing } from "@/components/pricing";
import { Cta } from "@/components/cta";
import { Footer } from "@/components/footer";

export default function LandingPage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Pricing />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
