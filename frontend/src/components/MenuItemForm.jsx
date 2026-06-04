import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const empty = {
  name: "",
  price: "",
  category: "",
  description: "",
  image_url: "",
  hsn_code: "",
  available: true,
  trackStock: false,
  stock: "",
  low_stock_threshold: 5,
};

export default function MenuItemForm({ open, editing, onClose, onSave }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      const trackStock = editing.stock !== null && editing.stock !== undefined;
      setForm({
        name: editing.name,
        price: editing.price,
        category: editing.category,
        description: editing.description || "",
        image_url: editing.image_url || "",
        hsn_code: editing.hsn_code || "",
        available: editing.available !== false,
        trackStock,
        stock: trackStock ? editing.stock : "",
        low_stock_threshold: editing.low_stock_threshold ?? 5,
      });
    } else {
      setForm(empty);
    }
  }, [editing, open]);

  const handleSubmit = async () => {
    if (!form.name || !form.category || form.price === "") {
      toast.error("Name, price, and category are required");
      return;
    }
    if (form.trackStock && (form.stock === "" || Number(form.stock) < 0)) {
      toast.error("Enter a non-negative stock quantity");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        price: Number(form.price),
        category: form.category.trim(),
        description: form.description || "",
        image_url: form.image_url || "",
        hsn_code: form.hsn_code || "",
        available: form.available !== false,
        stock: form.trackStock ? Math.max(0, parseInt(form.stock, 10)) : null,
        low_stock_threshold: Math.max(0, parseInt(form.low_stock_threshold, 10) || 0),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white border-[#E8E4D9] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-[#2A2421]">
            {editing ? "Edit Item" : "New Item"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-xl border-[#E8E4D9]"
              data-testid="menu-form-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Price</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="rounded-xl border-[#E8E4D9]"
                data-testid="menu-form-price"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="rounded-xl border-[#E8E4D9]"
                data-testid="menu-form-category"
                placeholder="e.g. Coffee"
              />
            </div>
          </div>
          <div>
            <Label>Image URL (optional)</Label>
            <Input
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              className="rounded-xl border-[#E8E4D9]"
              data-testid="menu-form-image"
              placeholder="https://…"
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="rounded-xl border-[#E8E4D9]"
              data-testid="menu-form-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>HSN / SAC Code <span className="text-[#7A736E] font-normal text-xs">(GST)</span></Label>
              <Input
                value={form.hsn_code}
                onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
                className="rounded-xl border-[#E8E4D9] font-mono"
                data-testid="menu-form-hsn"
                placeholder="e.g. 2101"
              />
            </div>
            <div className="flex flex-col justify-end">
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label className="text-[#2A2421]">Available on QR menu</Label>
                </div>
                <Switch
                  checked={form.available !== false}
                  onCheckedChange={(v) => setForm({ ...form, available: v })}
                  data-testid="menu-form-available"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E8E4D9]">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-[#2A2421]">Inventory tracking</Label>
                <p className="text-xs text-[#7A736E] mt-0.5">Auto-decrement stock when this item is billed.</p>
              </div>
              <Switch
                checked={form.trackStock}
                onCheckedChange={(v) => setForm({ ...form, trackStock: v })}
                data-testid="menu-form-track-stock"
              />
            </div>
            {form.trackStock && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <Label>Current stock</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="rounded-xl border-[#E8E4D9]"
                    data-testid="menu-form-stock"
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Low-stock alert at</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={form.low_stock_threshold}
                    onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                    className="rounded-xl border-[#E8E4D9]"
                    data-testid="menu-form-threshold"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl border-[#E8E4D9]">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-xl bg-[#C97A7E] hover:bg-[#B56A6D] text-white"
            data-testid="menu-form-save"
          >
            {editing ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
