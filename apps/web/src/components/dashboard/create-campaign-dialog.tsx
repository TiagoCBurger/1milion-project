"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const OBJECTIVES = [
  { value: "OUTCOME_TRAFFIC", label: "Traffic" },
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_SALES", label: "Sales" },
  { value: "OUTCOME_AWARENESS", label: "Awareness" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement" },
  { value: "OUTCOME_APP_PROMOTION", label: "App Promotion" },
];

const SPECIAL_CATEGORIES = [
  { value: "NONE", label: "None" },
  { value: "CREDIT", label: "Credit" },
  { value: "EMPLOYMENT", label: "Employment" },
  { value: "HOUSING", label: "Housing" },
  { value: "SOCIAL_ISSUES_ELECTIONS_POLITICS", label: "Social Issues / Elections / Politics" },
];

export function CreateCampaignDialog({
  workspaceId,
  accountId,
}: {
  workspaceId: string;
  accountId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [objective, setObjective] = useState("OUTCOME_TRAFFIC");
  const [dailyBudget, setDailyBudget] = useState("10");
  const [specialCategory, setSpecialCategory] = useState("NONE");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/meta/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          name,
          objective,
          daily_budget: Math.round(parseFloat(dailyBudget) * 100),
          special_ad_categories: specialCategory === "NONE" ? [] : [specialCategory],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create campaign");
        return;
      }

      setOpen(false);
      setName("");
      setDailyBudget("10");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New Campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Campaign</DialogTitle>
          <DialogDescription>
            Create a new Meta advertising campaign. It will start as paused.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Campaign Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Campaign"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Objective</Label>
            <Select value={objective} onValueChange={setObjective}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OBJECTIVES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="budget">Daily Budget ($)</Label>
            <Input
              id="budget"
              type="number"
              min="1"
              step="0.01"
              value={dailyBudget}
              onChange={(e) => setDailyBudget(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Special Ad Category</Label>
            <Select value={specialCategory} onValueChange={setSpecialCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SPECIAL_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
