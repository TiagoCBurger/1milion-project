"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRequirePlan } from "@/hooks/use-require-plan";
import { UpgradePaywallDialog } from "@/components/billing/upgrade-paywall-dialog";

const OPTIMIZATION_GOALS = [
  { value: "LINK_CLICKS", label: "Link Clicks" },
  { value: "LANDING_PAGE_VIEWS", label: "Landing Page Views" },
  { value: "REACH", label: "Reach" },
  { value: "IMPRESSIONS", label: "Impressions" },
  { value: "CONVERSIONS", label: "Conversions" },
];

const BILLING_EVENTS = [
  { value: "IMPRESSIONS", label: "Impressions" },
  { value: "LINK_CLICKS", label: "Link Clicks" },
];

export function CreateAdSetDialog({
  organizationId,
  accountId,
  campaigns,
}: {
  organizationId: string;
  accountId: string;
  campaigns: { id: string; name: string; hasBudget: boolean; bidStrategy: string | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { guard, paywallOpen, setPaywallOpen } = useRequirePlan("pro");

  const [name, setName] = useState("");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const selectedCampaign = campaigns.find((c) => c.id === campaignId);
  const hasCampaignBudget = selectedCampaign?.hasBudget ?? false;
  const BID_AMOUNT_REQUIRED_STRATEGIES = ["LOWEST_COST_WITH_BID_CAP", "TARGET_COST"];
  const bidAmountRequired = BID_AMOUNT_REQUIRED_STRATEGIES.includes(selectedCampaign?.bidStrategy ?? "");
  const [optimizationGoal, setOptimizationGoal] = useState("LINK_CLICKS");
  const [billingEvent, setBillingEvent] = useState("IMPRESSIONS");
  const [dailyBudget, setDailyBudget] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("65");
  const [countries, setCountries] = useState("BR");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!hasCampaignBudget && !dailyBudget) {
      setError("Enter a daily budget for this ad set, or use a campaign with Campaign Budget Optimization.");
      setLoading(false);
      return;
    }

    if (bidAmountRequired && !bidAmount) {
      setError(`This campaign uses ${selectedCampaign?.bidStrategy} — a bid amount is required.`);
      setLoading(false);
      return;
    }

    try {
      const targeting = {
        age_min: parseInt(ageMin),
        age_max: parseInt(ageMax),
        geo_locations: {
          countries: countries.split(",").map((c) => c.trim().toUpperCase()),
        },
        targeting_automation: { advantage_audience: 1 },
      };

      const res = await fetch(`/api/organizations/${organizationId}/meta/adsets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          campaign_id: campaignId,
          name,
          optimization_goal: optimizationGoal,
          billing_event: billingEvent,
          daily_budget: hasCampaignBudget ? undefined : String(Math.round(parseFloat(dailyBudget) * 100)),
          bid_amount: bidAmount ? String(Math.round(parseFloat(bidAmount) * 100)) : undefined,
          targeting,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create ad set");
        return;
      }

      setOpen(false);
      setName("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={guard(() => setOpen(true))}>
        <Plus className="mr-1.5 h-4 w-4" />
        New Ad Set
      </Button>
      <UpgradePaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        reason="Segmente audiências com ad sets ilimitados."
      />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Ad Set</DialogTitle>
          <DialogDescription>
            Define targeting, budget, and optimization for your ads.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="adset-name">Ad Set Name</Label>
            <Input
              id="adset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Ad Set"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Campaign</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger><SelectValue placeholder="Select campaign" /></SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Optimization Goal</Label>
              <Select value={optimizationGoal} onValueChange={setOptimizationGoal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPTIMIZATION_GOALS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Billing Event</Label>
              <Select value={billingEvent} onValueChange={setBillingEvent}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLING_EVENTS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {hasCampaignBudget ? (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground col-span-1">
                Budget managed at campaign level (CBO)
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="adset-budget">Daily Budget ($)</Label>
                <Input
                  id="adset-budget"
                  type="number"
                  min="1"
                  step="0.01"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="bid-amount">
                Bid Cap ($){bidAmountRequired && <span className="ml-1 text-destructive">*</span>}
              </Label>
              <Input
                id="bid-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder={bidAmountRequired ? "Required" : "Optional"}
              />
              {bidAmountRequired && (
                <p className="text-xs text-destructive">
                  Required for {selectedCampaign?.bidStrategy} strategy
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Targeting</Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="age-min" className="text-xs text-muted-foreground">Age Min</Label>
                <Input id="age-min" type="number" min="13" max="65" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="age-max" className="text-xs text-muted-foreground">Age Max</Label>
                <Input id="age-max" type="number" min="13" max="65" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="countries" className="text-xs text-muted-foreground">Countries</Label>
                <Input id="countries" value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="BR, US" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Ad Set"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
