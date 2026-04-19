export interface PageParts {
  hostname: string;
  pathname: string;
}

export function splitUrl(rawUrl: string): PageParts {
  try {
    const u = new URL(rawUrl);
    return { hostname: u.hostname.replace(/^www\./, ""), pathname: u.pathname };
  } catch {
    return { hostname: "", pathname: "" };
  }
}
