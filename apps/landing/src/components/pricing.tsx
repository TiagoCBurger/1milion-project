const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibefly.io";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying it out",
    features: [
      "1 workspace",
      "Read-only tools",
      "100 API calls / day",
      "Community support",
    ],
    cta: "Start Free",
    href: `${APP_URL}/signup`,
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/ month",
    description: "For marketers and small teams",
    features: [
      "3 workspaces",
      "All 35+ tools (read & write)",
      "5,000 API calls / day",
      "Priority support",
      "Team members",
    ],
    cta: "Start Free Trial",
    href: `${APP_URL}/signup?plan=pro`,
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For agencies and large teams",
    features: [
      "Unlimited workspaces",
      "All tools + custom tools",
      "Unlimited API calls",
      "Dedicated support",
      "SSO & audit logs",
      "Custom SLA",
    ],
    cta: "Contact Sales",
    href: "mailto:contato@vibefly.app",
    highlighted: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Start free, upgrade when you need write access and higher limits.
          </p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-8 shadow-sm ${
                plan.highlighted
                  ? "border-primary bg-white ring-2 ring-primary"
                  : "border-gray-200 bg-white"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}

              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-1 text-sm text-gray-500">{plan.description}</p>

              <div className="mt-6">
                <span className="text-4xl font-extrabold">{plan.price}</span>
                {plan.period && (
                  <span className="text-gray-500"> {plan.period}</span>
                )}
              </div>

              <ul className="mt-8 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 text-sm text-gray-700"
                  >
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href={plan.href}
                className={`mt-8 block rounded-xl px-6 py-3 text-center text-sm font-semibold transition ${
                  plan.highlighted
                    ? "bg-primary text-white hover:bg-primary-dark shadow-lg shadow-blue-500/25"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
