export function Features() {
  const features = [
    {
      icon: "📊",
      title: "35+ MCP Tools",
      description:
        "Full coverage of the Meta Ads API — campaigns, ad sets, ads, creatives, audiences, insights, and more.",
    },
    {
      icon: "🔒",
      title: "Secure by Design",
      description:
        "Tokens encrypted at rest, per-workspace isolation, API key authentication. Your data never leaves our infrastructure.",
    },
    {
      icon: "⚡",
      title: "Edge-Fast",
      description:
        "Runs on Cloudflare Workers at the edge. Sub-100ms latency to the Meta Graph API worldwide.",
    },
    {
      icon: "🤖",
      title: "Works with Any MCP Client",
      description:
        "Claude Desktop, Cursor, Windsurf, VS Code, or any tool that speaks MCP. One endpoint, every AI.",
    },
    {
      icon: "👥",
      title: "Team Workspaces",
      description:
        "One workspace per Business Manager. Invite your team, share access, and manage permissions.",
    },
    {
      icon: "📈",
      title: "Usage Dashboard",
      description:
        "Track API calls, monitor usage, and stay within your plan limits with real-time analytics.",
    },
  ];

  return (
    <section id="features" className="bg-surface px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to manage Meta Ads with AI
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            A complete MCP server for Meta Ads, hosted and managed for you.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <span className="text-3xl">{feature.icon}</span>
              <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-gray-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
