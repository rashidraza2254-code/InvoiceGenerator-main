import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Zap } from "lucide-react";

const PLAN_FEATURES = {
  free: [
    "1 branch",
    "100 bills per month",
    "GST-compliant invoices",
    "QR table ordering",
    "Loyalty program",
    "WhatsApp bills",
  ],
  starter: [
    "1 branch",
    "500 bills per month",
    "All Free features",
    "CSV export",
    "Analytics dashboard",
    "Priority support",
  ],
  pro: [
    "Up to 5 branches",
    "Unlimited bills",
    "All Starter features",
    "Multi-branch analytics",
    "Staff accounts",
    "Promo codes",
  ],
  enterprise: [
    "Unlimited branches",
    "Unlimited bills",
    "All Pro features",
    "Custom integrations",
    "Dedicated support",
    "SLA guarantee",
  ],
};

export default function Subscription() {
  const [sub, setSub] = useState(null);
  const [upgrading, setUpgrading] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/subscription`);
      setSub(r.data);
    } catch (e) {
      toast.error("Failed to load subscription info");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upgrade = async (planKey) => {
    setUpgrading(planKey);
    try {
      await axios.post(`${API}/subscription/upgrade?plan=${planKey}`);
      toast.success(`Upgraded to ${planKey} plan!`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upgrade failed");
    } finally {
      setUpgrading(null);
    }
  };

  if (!sub) {
    return (
      <div className="h-full flex items-center justify-center text-[#7A736E]">Loading…</div>
    );
  }

  const billsUsed = sub.bills_this_month || 0;
  const billsLimit = sub.max_bills_per_month;
  const usagePct = billsLimit > 0 ? Math.min(100, Math.round((billsUsed / billsLimit) * 100)) : 0;

  return (
    <div className="h-full overflow-y-auto scroll-soft">
      <div className="px-6 sm:px-8 py-6 max-w-4xl mx-auto">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#2A2421]">Subscription</h1>
        <p className="text-sm text-[#7A736E] mt-1">Manage your plan and usage.</p>

        {/* Current plan status */}
        <Card className="mt-6 bg-white border-[#E8E4D9] rounded-2xl p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-xs text-[#7A736E] font-medium uppercase tracking-wide">Current Plan</div>
              <div className="font-display text-2xl font-bold text-[#2A2421] mt-1 capitalize">{sub.plan_name}</div>
              {sub.restaurant_name && (
                <div className="text-sm text-[#7A736E] mt-0.5">{sub.restaurant_name}</div>
              )}
            </div>
            <Badge className="bg-[#6A7D64]/15 text-[#6A7D64] text-sm px-3 py-1">{sub.plan.toUpperCase()}</Badge>
          </div>

          {billsLimit > 0 && (
            <div className="mt-5">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[#7A736E]">Bills this month</span>
                <span className="font-medium text-[#2A2421]">{billsUsed} / {billsLimit}</span>
              </div>
              <div className="h-2 rounded-full bg-[#E8E4D9]">
                <div
                  className={"h-2 rounded-full transition-all " + (usagePct >= 90 ? "bg-[#C97A7E]" : "bg-[#6A7D64]")}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
              {usagePct >= 80 && (
                <p className="text-xs text-[#C97A7E] mt-1 font-medium">
                  {usagePct >= 100 ? "Bill limit reached — upgrade to continue billing." : `${100 - usagePct}% remaining this month.`}
                </p>
              )}
            </div>
          )}
          {billsLimit === -1 && (
            <p className="text-sm text-[#6A7D64] mt-4 font-medium">Unlimited bills</p>
          )}
        </Card>

        {/* Plans grid */}
        <h2 className="font-display text-xl font-bold text-[#2A2421] mt-8 mb-4">All Plans</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(sub.all_plans || []).map((plan) => {
            const isCurrent = plan.key === sub.plan;
            const features = PLAN_FEATURES[plan.key] || [];
            return (
              <Card
                key={plan.key}
                className={"rounded-2xl p-5 border " + (isCurrent ? "border-[#C97A7E] bg-[#C97A7E]/5" : "border-[#E8E4D9] bg-white")}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="font-display font-bold text-lg text-[#2A2421]">{plan.name}</div>
                  {isCurrent && <Badge className="bg-[#C97A7E] text-white text-xs">Current</Badge>}
                </div>
                <div className="mb-4">
                  {plan.price_inr === 0 ? (
                    <span className="text-2xl font-bold text-[#2A2421]">Free</span>
                  ) : plan.price_inr === -1 ? (
                    <span className="text-2xl font-bold text-[#2A2421]">Custom</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-[#2A2421]">₹{plan.price_inr.toLocaleString("en-IN")}</span>
                      <span className="text-sm text-[#7A736E]">/mo</span>
                    </>
                  )}
                </div>
                <ul className="space-y-1.5 mb-5">
                  {features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-[#2A2421]">
                      <Check className="w-4 h-4 text-[#6A7D64] shrink-0 mt-0.5" />
                      {feat}
                    </li>
                  ))}
                </ul>
                {!isCurrent && plan.key !== "enterprise" && (
                  <Button
                    onClick={() => upgrade(plan.key)}
                    disabled={upgrading === plan.key}
                    className={"w-full rounded-xl text-sm " + (plan.key === "pro" ? "bg-[#C97A7E] hover:bg-[#B56A6D] text-white" : "bg-[#6A7D64] hover:bg-[#586A53] text-white")}
                    data-testid={`upgrade-${plan.key}`}
                  >
                    <Zap className="w-3 h-3 mr-1" />
                    {upgrading === plan.key ? "Upgrading…" : "Upgrade"}
                  </Button>
                )}
                {!isCurrent && plan.key === "enterprise" && (
                  <Button variant="outline" className="w-full rounded-xl text-sm border-[#E8E4D9]" onClick={() => window.open("mailto:sales@cafeapp.in", "_blank")}>
                    Contact Sales
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
