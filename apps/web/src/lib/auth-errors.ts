export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();

  // Password policy
  if (m.includes("password should be") || m.includes("password must be") || m.includes("at least 12") || m.includes("characters or more")) {
    return "Password must be at least 12 characters.";
  }
  if (m.includes("password should contain") || m.includes("password must contain") || m.includes("uppercase") || m.includes("special character")) {
    return "Password must include uppercase, lowercase, a number and a symbol.";
  }

  // Signup
  if (m.includes("user already registered") || m.includes("already been registered") || m.includes("already registered")) {
    return "This email is already registered. Try signing in instead.";
  }
  if (m.includes("unable to validate email") || m.includes("invalid email")) {
    return "Please enter a valid email address.";
  }

  // Login
  if (m.includes("invalid login credentials") || m.includes("invalid credentials") || m.includes("wrong password")) {
    return "Incorrect email or password.";
  }
  if (m.includes("user not found") || m.includes("no user found")) {
    return "No account found with this email.";
  }

  // Rate limits
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("email sending")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  // Network
  if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch")) {
    return "Connection error. Check your internet and try again.";
  }

  return message;
}
