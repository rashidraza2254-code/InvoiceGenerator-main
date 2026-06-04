import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const CURRENCIES = [
  { code: "INR", label: "INR (₹)" },
  { code: "USD", label: "USD ($)" },
  { code: "EUR", label: "EUR (€)" },
  { code: "GBP", label: "GBP (£)" },
  { code: "JPY", label: "JPY (¥)" },
  { code: "AED", label: "AED (د.إ)" },
];

const PRINT_WIDTHS = [
  { value: "80mm", label: "80mm (standard thermal)" },
  { value: "58mm", label: "58mm (mini thermal)" },
];

const empty = {
  cafe_name: "",
  cafe_address: "",
  currency: "INR",
  tax_percent: 5,
  service_percent: 10,
  gstin: "",
  gst_type: "cgst_sgst",
  pan: "",
  fssai_license: "",
  receipt_footer: "Thank you! Please visit again.",
  print_width: "80mm",
};

export default function Settings() {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/settings`);
      setForm({ ...empty, ...r.data });
    } catch (e) {
      toast.error("Failed to load settings");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/settings`, {
        ...form,
        tax_percent: Number(form.tax_percent),
        service_percent: Number(form.service_percent),
      });
      toast.success("Settings saved");
    } catch (_) {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const f = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="h-full overflow-y-auto scroll-soft">
      <div className="px-6 sm:px-8 py-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#2A2421]">Settings</h1>
          <p className="text-sm text-[#7A736E] mt-1">Cafe info, GST compliance, and print preferences.</p>
        </div>

        {/* Basic Info */}
        <Card className="bg-white border-[#E8E4D9] rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-lg text-[#2A2421]">Cafe Info</h2>
          <div>
            <Label>Cafe Name</Label>
            <Input value={form.cafe_name} onChange={f("cafe_name")} className="rounded-xl border-[#E8E4D9]" data-testid="settings-cafe-name" />
          </div>
          <div>
            <Label>Cafe Address</Label>
            <Input value={form.cafe_address} onChange={f("cafe_address")} className="rounded-xl border-[#E8E4D9]" data-testid="settings-cafe-address" />
          </div>
          <div>
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger className="rounded-xl border-[#E8E4D9]" data-testid="settings-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Default Tax %</Label>
              <Input type="number" min="0" step="0.5" value={form.tax_percent} onChange={f("tax_percent")} className="rounded-xl border-[#E8E4D9]" data-testid="settings-tax-percent" />
            </div>
            <div>
              <Label>Default Service %</Label>
              <Input type="number" min="0" step="0.5" value={form.service_percent} onChange={f("service_percent")} className="rounded-xl border-[#E8E4D9]" data-testid="settings-service-percent" />
            </div>
          </div>
        </Card>

        {/* GST Compliance */}
        <Card className="bg-white border-[#E8E4D9] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-display font-semibold text-lg text-[#2A2421]">GST & Compliance</h2>
            <Badge className="bg-[#6A7D64]/15 text-[#6A7D64] text-xs">India</Badge>
          </div>

          <div>
            <Label>GSTIN (GST Identification Number)</Label>
            <Input
              value={form.gstin}
              onChange={f("gstin")}
              placeholder="22AAAAA0000A1Z5"
              className="rounded-xl border-[#E8E4D9] font-mono"
              data-testid="settings-gstin"
            />
            <p className="text-xs text-[#7A736E] mt-1">Leave blank if not GST registered.</p>
          </div>

          <div>
            <Label>GST Type</Label>
            <Select value={form.gst_type} onValueChange={(v) => setForm({ ...form, gst_type: v })}>
              <SelectTrigger className="rounded-xl border-[#E8E4D9]" data-testid="settings-gst-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cgst_sgst">CGST + SGST (intra-state)</SelectItem>
                <SelectItem value="igst">IGST (inter-state)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-[#7A736E] mt-1">
              {form.gst_type === "cgst_sgst"
                ? `Tax split as CGST ${form.tax_percent / 2}% + SGST ${form.tax_percent / 2}%`
                : `Tax shown as IGST ${form.tax_percent}%`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>PAN Number</Label>
              <Input
                value={form.pan}
                onChange={f("pan")}
                placeholder="AAAAA9999A"
                className="rounded-xl border-[#E8E4D9] font-mono"
                data-testid="settings-pan"
              />
            </div>
            <div>
              <Label>FSSAI License</Label>
              <Input
                value={form.fssai_license}
                onChange={f("fssai_license")}
                placeholder="12345678901234"
                className="rounded-xl border-[#E8E4D9] font-mono"
                data-testid="settings-fssai"
              />
            </div>
          </div>
        </Card>

        {/* Print Settings */}
        <Card className="bg-white border-[#E8E4D9] rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-semibold text-lg text-[#2A2421]">Thermal Print</h2>

          <div>
            <Label>Paper Width</Label>
            <Select value={form.print_width} onValueChange={(v) => setForm({ ...form, print_width: v })}>
              <SelectTrigger className="rounded-xl border-[#E8E4D9]" data-testid="settings-print-width">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRINT_WIDTHS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Receipt Footer Message</Label>
            <Input
              value={form.receipt_footer}
              onChange={f("receipt_footer")}
              placeholder="Thank you! Please visit again."
              className="rounded-xl border-[#E8E4D9]"
              data-testid="settings-receipt-footer"
            />
          </div>
        </Card>

        <Button onClick={save} disabled={saving} className="rounded-xl bg-[#C97A7E] hover:bg-[#B56A6D] text-white w-full" data-testid="settings-save-button">
          {saving ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
