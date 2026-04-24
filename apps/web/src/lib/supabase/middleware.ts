import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Handle PKCE code exchange for email confirmation
  if (
    request.nextUrl.pathname === "/auth/confirm" &&
    request.nextUrl.searchParams.get("code")
  ) {
    const code = request.nextUrl.searchParams.get("code")!;
    const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
    const destination = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/confirm";
      url.search = "?confirmed=true&next=" + encodeURIComponent(destination);
      // Copy session cookies to the redirect response
      const redirectResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
    // If exchange fails, let the page render and show the error
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users trying to access dashboard
  if (
    !user &&
    request.nextUrl.pathname.startsWith("/dashboard")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (
    user &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/signup")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
