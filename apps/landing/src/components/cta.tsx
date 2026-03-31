const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibefly.io";

export function Cta() {
  return (
    <section className="bg-gradient-to-r from-primary to-accent px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Ready to manage Meta Ads with AI?
        </h2>
        <p className="mt-4 text-lg text-blue-100">
          Join the beta and start managing your campaigns through natural
          language today. Free tier included.
        </p>
        <a
          href={`${APP_URL}/signup`}
          className="mt-8 inline-block rounded-xl bg-white px-8 py-4 text-lg font-semibold text-primary shadow-lg hover:bg-gray-50 transition"
        >
          Get Started Free &rarr;
        </a>
      </div>
    </section>
  );
}
