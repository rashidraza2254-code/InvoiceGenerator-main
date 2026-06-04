import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { currencyToSymbol } from "@/lib/pdf";

const PAYMENT_MODES = ["Cash", "Card", "UPI", "Other"];

export default function PaymentSplitter({
  total,
  currency,
  paymentMode,
  setPaymentMode,
  splits,
  setSplits,
  splitEnabled,
  setSplitEnabled,
}) {
  const c = currencyToSymbol(currency);
  const sum = splits.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = total - sum;

  const updateRow = (idx, patch) => {
    setSplits((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const addRow = () => {
    setSplits((prev) => [...prev, { mode: nextMode(prev), amount: Math.max(0, remaining) }]);
  };

  const removeRow = (idx) => {
    setSplits((prev) => prev.filter((_, i) => i !== idx));
  };

  const enableSplit = () => {
    setSplitEnabled(true);
    if (splits.length === 0) {
      setSplits([{ mode: paymentMode || "Cash", amount: total }]);
    }
  };

  const disableSplit = () => {
    setSplitEnabled(false);
    setSplits([]);
  };

  if (!splitEnabled) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs text-[#7A736E]">Payment mode</Label>
          <button
            type="button"
            onClick={enableSplit}
            className="text-xs text-[#C97A7E] hover:underline"
            data-testid="enable-split-payment"
          >
            Split payment
          </button>
        </div>
        <Select value={paymentMode} onValueChange={setPaymentMode}>
          <SelectTrigger className="h-9 rounded-lg border-[#E8E4D9]" data-testid="payment-mode-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_MODES.map((m) => (
              <SelectItem key={m} value={m} data-testid={`payment-mode-${m}`}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const ok = Math.abs(remaining) < 0.01 && splits.every((p) => Number(p.amount) > 0);

  return (
    <div data-testid="split-payment-panel">
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs text-[#7A736E]">Split payment</Label>
        <button
          type="button"
          onClick={disableSplit}
          className="text-xs text-[#7A736E] hover:text-[#2A2421]"
          data-testid="disable-split-payment"
        >
          Use single mode
        </button>
      </div>
      <div className="space-y-1.5">
        {splits.map((p, idx) => (
          <div key={idx} className="flex items-center gap-1.5" data-testid={`split-row-${idx}`}>
            <Select value={p.mode} onValueChange={(v) => updateRow(idx, { mode: v })}>
              <SelectTrigger className="h-9 rounded-lg border-[#E8E4D9] w-28" data-testid={`split-mode-${idx}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_MODES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={p.amount}
              onChange={(e) => updateRow(idx, { amount: e.target.value })}
              className="h-9 rounded-lg border-[#E8E4D9] flex-1 tabular-nums"
              data-testid={`split-amount-${idx}`}
            />
            {splits.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="text-[#7A736E] hover:text-red-600 w-6 h-6 flex items-center justify-center"
                data-testid={`split-remove-${idx}`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="w-full mt-1 text-xs text-[#C97A7E] flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-[#E8E4D9] hover:border-[#C97A7E]"
          data-testid="split-add-row"
        >
          <Plus className="w-3 h-3" /> Add payment
        </button>
        <div
          className={
            "text-xs mt-1 px-2 py-1 rounded-md " +
            (ok ? "bg-[#6A7D64]/10 text-[#6A7D64]" : "bg-red-50 text-red-600")
          }
          data-testid="split-remaining"
        >
          {ok ? (
            <>Payments cover the full bill ✓</>
          ) : (
            <>
              Remaining: {c}
              {remaining.toFixed(2)} ({(remaining >= 0 ? "needs " : "over by ")}
              {c}
              {Math.abs(remaining).toFixed(2)})
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function nextMode(prev) {
  const used = new Set(prev.map((p) => p.mode));
  return PAYMENT_MODES.find((m) => !used.has(m)) || "Cash";
}
