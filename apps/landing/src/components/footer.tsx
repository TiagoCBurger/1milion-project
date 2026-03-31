const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibefly.io";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div>
          <span className="text-lg font-bold tracking-tight">
            <span className="text-primary">Vibe</span>Fly
          </span>
          <p className="mt-1 text-sm text-gray-500">
            AI-powered Meta Ads management via MCP. By VibeFly.
          </p>
        </div>

        <nav className="flex gap-6 text-sm text-gray-500">
          <a href="/privacy" className="hover:text-gray-900 transition">
            Privacy
          </a>
          <a href="/terms" className="hover:text-gray-900 transition">
            Terms
          </a>
          <a
            href="mailto:support@vibefly.io"
            className="hover:text-gray-900 transition"
          >
            Contact
          </a>
          <a href={`${APP_URL}/login`} className="hover:text-gray-900 transition">
            Sign in
          </a>
        </nav>
      </div>

      <div className="mx-auto mt-8 max-w-6xl border-t border-gray-100 pt-6 text-center text-xs text-gray-400">
        <p>
          &copy; {new Date().getFullYear()} VibeFly. All rights reserved.
        </p>
        <p className="mt-2">
          CNPJ: 61.750.788/0001-48 &mdash; 61.750.788 TIAGO CASAS BURGER
        </p>
      </div>
    </footer>
  );
}
