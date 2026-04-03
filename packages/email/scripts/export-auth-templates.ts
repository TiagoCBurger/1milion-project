// ============================================================
// Export Auth Templates to static HTML for Supabase Dashboard
// ============================================================

import { render } from "@react-email/components";
import { createElement } from "react";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

import { ConfirmEmailTemplate } from "../src/templates/auth/confirm-email";
import { ResetPasswordTemplate } from "../src/templates/auth/reset-password";
import { MagicLinkTemplate } from "../src/templates/auth/magic-link";
import { InviteUserTemplate } from "../src/templates/auth/invite-user";

const outDir = join(__dirname, "..", "dist", "auth");

const templates = [
  { name: "confirm-email", component: ConfirmEmailTemplate },
  { name: "reset-password", component: ResetPasswordTemplate },
  { name: "magic-link", component: MagicLinkTemplate },
  { name: "invite-user", component: InviteUserTemplate },
];

async function main() {
  mkdirSync(outDir, { recursive: true });

  for (const { name, component } of templates) {
    // Render with default props (which contain Supabase placeholders)
    const html = await render(createElement(component, {}));
    const outPath = join(outDir, `${name}.html`);
    writeFileSync(outPath, html, "utf-8");
    console.log(`✓ Exported ${name}.html`);
  }

  console.log(`\nAll auth templates exported to: ${outDir}`);
  console.log("Copy each HTML into Supabase Dashboard > Auth > Email Templates");
}

main().catch(console.error);
