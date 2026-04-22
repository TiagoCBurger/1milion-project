import { isbot } from "isbot";

export function isBotRequest(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return isbot(userAgent);
}
