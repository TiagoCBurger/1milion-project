const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.metaadsmcp.com";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 to-white px-6 py-24 sm:py-32">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-blue-100/60 blur-3xl" />
      <div className="pointer-events-none absolute -top-20 right-0 h-[400px] w-[400px] rounded-full bg-violet-100/40 blur-3xl" />

      <div className="relative mx-auto max-w-4xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          Now in Beta
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
          Manage Meta Ads{" "}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            with AI
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 sm:text-xl">
          Connect your Meta Ads account to Claude, Cursor, Windsurf, or any
          MCP-compatible AI tool. Create campaigns, analyze performance, and
          optimize spend — all through natural language.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href={`${APP_URL}/signup`}
            className="w-full rounded-xl bg-primary px-8 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-blue-500/25 hover:bg-primary-dark hover:shadow-blue-500/40 transition sm:w-auto"
          >
            Start Free &rarr;
          </a>
          <a
            href="#how-it-works"
            className="w-full rounded-xl border border-gray-300 px-8 py-4 text-center text-lg font-semibold text-gray-700 hover:bg-gray-50 transition sm:w-auto"
          >
            See how it works
          </a>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          Free tier available. No credit card required.
        </p>

        {/* Terminal mockup */}
        <div className="mx-auto mt-16 max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-gray-950 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span className="h-3 w-3 rounded-full bg-yellow-500" />
            <span className="h-3 w-3 rounded-full bg-green-500" />
            <span className="ml-3 text-xs text-gray-500">Claude Desktop</span>
          </div>
          <div className="p-6 text-left font-mono text-sm leading-relaxed text-gray-300">
            <p>
              <span className="text-blue-400">You:</span> Show me my top 5
              campaigns by ROAS this month
            </p>
            <p className="mt-4">
              <span className="text-green-400">Claude:</span> Here are your top
              campaigns by ROAS for March 2026:
            </p>
            <div className="mt-3 rounded-lg bg-gray-900 p-4 text-xs">
              <table className="w-full">
                <thead>
                  <tr className="text-gray-500">
                    <td className="pb-2">Campaign</td>
                    <td className="pb-2 text-right">Spend</td>
                    <td className="pb-2 text-right">ROAS</td>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <tr>
                    <td>Spring Sale - Lookalike</td>
                    <td className="text-right">$2,450</td>
                    <td className="text-right text-green-400">4.8x</td>
                  </tr>
                  <tr>
                    <td>Retargeting - Cart</td>
                    <td className="text-right">$1,200</td>
                    <td className="text-right text-green-400">3.9x</td>
                  </tr>
                  <tr>
                    <td>Brand Awareness US</td>
                    <td className="text-right">$3,800</td>
                    <td className="text-right text-green-400">3.2x</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-gray-500">
              Want me to increase the budget on your top performer?
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
