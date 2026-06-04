import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Ticket } from "lucide-react";
import { toast } from "sonner";

const empty = { code: "", discount_type: "percent", value: "", max_uses: "", description: "", active: true };

export default function Promos() {
  const [promos, setPromos] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setPromos((await axios.get(`${API}/promos`)).data); }
    catch (_) { toast.error("Failed to load promos"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.code || !form.value) { toast.error("Code and value required"); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/promos`, {
        code: form.code.toUpperCase(),
        discount_type: form.discount_type,
        value: Number(form.value),
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        description: form.description,
        active: form.active,
      });
      toast.success("Promo created");
      setOpen(false); setForm(empty); load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create");
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    try { await axios.delete(`${API}/promos/${id}`); toast.success("Deleted"); load(); }
    catch (_) { toast.error("Delete failed"); }
  };

  return (
    <div className="h-full overflow-y-auto scroll-soft">
      <div className="px-6 sm:px-8 py-6 max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#2A2421]">Promo Codes</h1>
            <p className="text-sm text-[#7A736E] mt-1">Create reusable discount codes for the POS.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl bg-[#C97A7E] hover:bg-[#B56A6D] text-white" data-testid="add-promo-button">
                <Plus className="w-4 h-4 mr-2" /> New Code
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E8E4D9] rounded-2xl">
              <DialogHeader><DialogTitle className="font-display text-2xl">New Promo</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Code</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className="rounded-xl border-[#E8E4D9] uppercase" data-testid="promo-form-code" placeholder="WELCOME10" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Type</Label>
                    <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
                      <SelectTrigger className="rounded-xl border-[#E8E4D9]" data-testid="promo-form-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">% off</SelectItem>
                        <SelectItem value="flat">Flat ₹ off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{form.discount_type === "percent" ? "Percent" : "Amount"}</Label>
                    <Input type="number" min="0" step="0.5" value={form.value}
                      onChange={(e) => setForm({ ...form, value: e.target.value })}
                      className="rounded-xl border-[#E8E4D9]" data-testid="promo-form-value" />
                  </div>
                </div>
                <div>
                  <Label>Max uses (optional)</Label>
                  <Input type="number" min="0" step="1" value={form.max_uses}
                    onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                    className="rounded-xl border-[#E8E4D9]" data-testid="promo-form-maxuses" placeholder="Unlimited" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="rounded-xl border-[#E8E4D9]" data-testid="promo-form-desc" />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Active</Label>
                  <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl border-[#E8E4D9]">Cancel</Button>
                <Button onClick={save} disabled={saving} className="rounded-xl bg-[#C97A7E] text-white" data-testid="promo-form-save">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {promos.length === 0 ? (
          <div className="text-center text-[#7A736E] py-20" data-testid="promos-empty">
            No promo codes yet. Create one to give first-time customers a treat. 🎉
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {promos.map((p) => (
              <Card key={p.id} className="bg-white border-[#E8E4D9] rounded-2xl p-4" data-testid={`promo-row-${p.id}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-[#C97A7E]" />
                      <span className="font-mono font-bold text-lg text-[#2A2421]">{p.code}</span>
                    </div>
                    <div className="text-xs text-[#7A736E] mt-1">{p.description || "—"}</div>
                  </div>
                  <Badge variant="secondary" className={p.active ? "bg-[#6A7D64]/15 text-[#6A7D64]" : "bg-[#7A736E]/15"}>
                    {p.active ? "Active" : "Off"}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-display font-bold text-2xl text-[#C97A7E]">
                    {p.discount_type === "percent" ? `${p.value}%` : `₹${p.value}`}
                  </span>
                  <span className="text-xs text-[#7A736E]">
                    {p.uses} / {p.max_uses ?? "∞"} used
                  </span>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="mt-3 w-full text-red-600 hover:bg-red-50" data-testid={`delete-promo-${p.id}`}>
                      <Trash2 className="w-3 h-3 mr-1" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-white border-[#E8E4D9] rounded-2xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete &quot;{p.code}&quot;?</AlertDialogTitle>
                      <AlertDialogDescription>Already-applied bills are unaffected.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del(p.id)} className="rounded-xl bg-red-600 text-white">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
