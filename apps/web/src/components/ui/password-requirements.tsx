const REQUIREMENTS = [
  { label: "At least 12 characters", test: (p: string) => p.length >= 12 },
  { label: "Uppercase letter (A–Z)", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter (a–z)", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number (0–9)", test: (p: string) => /\d/.test(p) },
  { label: "Symbol (!@#$…)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export function PasswordRequirements({ password }: { password: string }) {
  if (!password) return null;

  return (
    <ul className="mt-2 space-y-1">
      {REQUIREMENTS.map((req) => {
        const met = req.test(password);
        return (
          <li
            key={req.label}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
            }`}
          >
            <span className="w-3 shrink-0 text-center">{met ? "✓" : "○"}</span>
            {req.label}
          </li>
        );
      })}
    </ul>
  );
}
