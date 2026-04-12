"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ConnectionsTabs({
  children,
  setupGuide,
}: {
  children: ReactNode;
  setupGuide: ReactNode;
}) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const defaultValue = tabParam === "setup" ? "setup" : "connections";

  return (
    <Tabs defaultValue={defaultValue} className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="connections">Conexões</TabsTrigger>
        <TabsTrigger value="setup">Guia de setup</TabsTrigger>
      </TabsList>
      <TabsContent value="connections" className="mt-6 space-y-8">
        {children}
      </TabsContent>
      <TabsContent value="setup" className="mt-6">
        {setupGuide}
      </TabsContent>
    </Tabs>
  );
}
