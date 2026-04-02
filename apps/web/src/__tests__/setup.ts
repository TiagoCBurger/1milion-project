import { vi } from "vitest";

// Mock Next.js modules
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  })),
  usePathname: vi.fn(() => "/dashboard/test"),
  useParams: vi.fn(() => ({ slug: "test" })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}));

// Provide env vars for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.TOKEN_ENCRYPTION_KEY = "test-encryption-key-32chars!!!!!";
process.env.FACEBOOK_APP_ID = "1234567890";
process.env.FACEBOOK_APP_SECRET = "test-app-secret";
process.env.OAUTH_SIGNING_SECRET = "test-oauth-signing-secret-32char";
