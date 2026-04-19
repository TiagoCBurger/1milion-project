"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Site {
  id: string;
  domain: string;
}

interface Props {
  sites: Site[];
  currentId: string;
}

export function SiteSelector({ sites, currentId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (sites.length === 0) return null;

  function onChange(value: string) {
    const next = new URLSearchParams(params.toString());
    next.set("site", value);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <Select value={currentId} onValueChange={onChange}>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Selecione um site" />
      </SelectTrigger>
      <SelectContent>
        {sites.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.domain}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
