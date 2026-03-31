const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.metaadsmcp.com";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="text-xl font-bold tracking-tight">
          <span className="text-primary">Meta Ads</span> MCP Cloud
        </a>

        <nav className="hidden items-center gap-8 text-sm font-medium text-gray-600 md:flex">
          <a href="#how-it-works" className="hover:text-gray-900 transition">
            How it works
          </a>
          <a href="#features" className="hover:text-gray-900 transition">
            Features
          </a>
          <a href="#pricing" className="hover:text-gray-900 transition">
            Pricing
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={`${APP_URL}/login`}
            className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 transition sm:block"
          >
            Sign in
          </a>
          <a
            href={`${APP_URL}/signup`}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark transition"
          >
            Get Started Free
          </a>
        </div>
      </div>
    </header>
  );
}
