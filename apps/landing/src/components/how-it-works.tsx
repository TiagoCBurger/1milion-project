export function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Connect your Meta account",
      description:
        "Sign up and link your Meta Business Manager. We securely store your access token with encryption at rest.",
    },
    {
      number: "02",
      title: "Copy your MCP endpoint",
      description:
        "Get a unique MCP endpoint URL for your workspace. Add it to Claude Desktop, Cursor, or any MCP client.",
    },
    {
      number: "03",
      title: "Talk to your ads",
      description:
        "Ask questions in natural language, create campaigns, adjust budgets, and get performance insights — all through AI.",
    },
  ];

  return (
    <section id="how-it-works" className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Up and running in minutes
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            No SDKs, no code, no infrastructure to manage.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="relative rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
            >
              <span className="text-5xl font-extrabold text-gray-100">
                {step.number}
              </span>
              <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 text-gray-600">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
