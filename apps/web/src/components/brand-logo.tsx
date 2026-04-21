import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  href?: string;
  /** Hero / footer da landing (fundo preto) — cápsula branca para o wordmark escuro */
  variant?: "default" | "onDarkPage";
  /** Sidebar: em tema escuro, mesma cápsula para contraste */
  sidebar?: boolean;
  className?: string;
};

export function BrandLogo({
  href = "/",
  variant = "default",
  sidebar = false,
  className,
}: BrandLogoProps) {
  const img = (
    <Image
      src="/logo.svg"
      alt="VibeFly"
      width={240}
      height={55}
      priority
      className={cn(
        "w-auto",
        variant === "onDarkPage" ? "h-6 sm:h-7" : "h-8 sm:h-9",
      )}
    />
  );

  const wrapped =
    variant === "onDarkPage" ? (
      <span className="inline-flex items-center rounded-lg bg-white/95 px-2.5 py-1.5 shadow-sm">
        {img}
      </span>
    ) : sidebar ? (
      <span className="inline-flex items-center rounded-lg dark:bg-white/95 dark:px-2 dark:py-1.5">
        {img}
      </span>
    ) : (
      img
    );

  return (
    <Link href={href} className={cn("inline-flex shrink-0 items-center", className)}>
      {wrapped}
    </Link>
  );
}
