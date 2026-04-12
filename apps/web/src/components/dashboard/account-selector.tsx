"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Account {
  id: string;
  meta_account_id: string;
  name: string;
}

interface AccountSelectorProps {
  accounts: Account[];
  current: string;
  /** When true, shows a single-account select instead of hiding (useful on dashboards). */
  alwaysShow?: boolean;
}

export function AccountSelector({ accounts, current, alwaysShow }: AccountSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("account_id", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  if (accounts.length <= 1 && !alwaysShow) return null;

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger className="w-[min(100%,280px)] sm:w-[280px]">
        <SelectValue placeholder="Conta de anúncios" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((acc) => (
          <SelectItem key={acc.id} value={acc.meta_account_id}>
            {acc.name} ({acc.meta_account_id})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
