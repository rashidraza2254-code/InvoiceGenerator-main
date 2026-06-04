import React, { useEffect, useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { Card } from "@/components/ui/card";
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
import { Plus, Minus, Trash2, ShoppingCart, Receipt as ReceiptIcon, Tag, Sparkles, X, Check } from "lucide-react";
import { currencyToSymbol } from "@/lib/pdf";
import PaymentSplitter from "@/components/PaymentSplitter";
import { toast } from "sonner";

export default function CartPanel(props) {
  const {
    cart, inc, dec, removeItem, setItemDiscount, clear, subtotal,
    taxPercent, setTaxPercent, servicePercent, setServicePercent,
    discount, setDiscount, customerName, setCustomerName,
    customerPhone, setCustomerPhone, loyaltyPoints, setLoyaltyPoints,
    redeemPoints, setRedeemPoints,
    paymentMode, setPaymentMode, splits, setSplits, splitEnabled, setSplitEnabled,
    tipAmount, setTipAmount, promoCode, setPromoCode, promoDiscount, setPromoDiscount,
    tableId, setTableId, tables,
    total, taxAmount, serviceAmount, currency, busy, onGenerate,
  } = props;
  const c = currencyToSymbol(currency);
  const [promoState, setPromoState] = useState({ status: "idle", message: "" });

  // Lookup customer when phone changes (debounced)
  useEffect(() => {
    const phone = (customerPhone || "").trim();
    if (!phone || phone.length < 6) {
      setLoyaltyPoints(0);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await axios.get(`${API}/customers/by-phone/${encodeURIComponent(phone)}`);
        if (r.data) {
          setLoyaltyPoints(r.data.points || 0);
          if (r.data.name && !customerName) setCustomerName(r.data.name);
        } else {
          setLoyaltyPoints(0);
        }
      } catch (_) {
        setLoyaltyPoints(0);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerPhone]);

  const applyPromo = async () => {
    const code = (promoCode || "").trim().toUpperCase();
    if (!code) {
      setPromoDiscount(0);
      setPromoState({ status: "idle", message: "" });
      return;
    }
    setPromoState({ status: "checking", message: "" });
    try {
      const r = await axios.get(`${API}/promos/validate`, { params: { code, subtotal } });
      setPromoDiscount(r.data.discount);
      setPromoCode(r.data.code);
      setPromoState({ status: "ok", message: `Applied — ${c}${r.data.discount.toFixed(2)} off` });
    } catch (e) {
      setPromoDiscount(0);
      setPromoState({ status: "err", message: e.response?.data?.detail || "Invalid code" });
    }
  };

  const clearPromo = () => {
    setPromoCode("");
    setPromoDiscount(0);
    setPromoState({ status: "idle", message: "" });
  };

  // Recompute promo when subtotal changes (if applied)
  useEffect(() => {
    if (promoState.status === "ok" && promoCode) applyPromo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  const maxRedeem = Math.min(loyaltyPoints || 0, Math.max(0, subtotal - Number(discount || 0) - promoDiscount));

  return (
    <Card className="bg-[#F5F2EA] border-[#E8E4D9] rounded-2xl flex flex-col overflow-hidden">
      <div className="p-5 border-b border-[#E8E4D9] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-[#C97A7E]" />
          <h2 className="font-display font-bold text-xl text-[#2A2421]">Current Bill</h2>
        </div>
        <span className="text-sm text-[#7A736E]" data-testid="cart-count">{cart.length} item{cart.length !== 1 && "s"}</span>
      </div>

      <div className="flex-1 overflow-y-auto scroll-soft p-4 space-y-2">
        {cart.length === 0 ? (
          <div className="text-center text-[#7A736E] py-10">
            <ReceiptIcon className="w-10 h-10 mx-auto mb-2 text-[#C97A7E]/40" />
            <p className="text-sm">Tap menu items to add to the bill.</p>
          </div>
        ) : cart.map((item) => (
          <CartRow key={item.menu_item_id} item={item} c={c}
            onInc={() => inc(item.menu_item_id)} onDec={() => dec(item.menu_item_id)}
            onRemove={() => removeItem(item.menu_item_id)}
            onSetDiscount={(v) => setItemDiscount(item.menu_item_id, v)} />
        ))}
      </div>

      <div className="p-4 border-t border-[#E8E4D9] bg-white space-y-3">
        {tables && tables.length > 0 && (
          <div>
            <Label className="text-xs text-[#7A736E]">Table</Label>
            <Select value={tableId || "none"} onValueChange={(v) => setTableId(v === "none" ? null : v)}>
              <SelectTrigger className="h-9 rounded-lg border-[#E8E4D9]" data-testid="table-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No table / Takeaway</SelectItem>
                {tables.map((t) => (
                  <SelectItem key={t.id} value={t.id} disabled={t.status === "occupied"}>
                    {t.name} {t.status === "occupied" ? "(occupied)" : `· ${t.capacity}p`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <NumField label="Tax %" value={taxPercent} onChange={setTaxPercent} testid="tax-input" />
          <NumField label="Service %" value={servicePercent} onChange={setServicePercent} testid="service-input" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumField label={`Bill disc. (${c})`} value={discount} onChange={setDiscount} testid="discount-input" step="1" />
          <NumField label={`Tip (${c})`} value={tipAmount} onChange={setTipAmount} testid="tip-input" step="1" />
        </div>

        <div>
          <Label className="text-xs text-[#7A736E]">Promo code</Label>
          <div className="flex gap-1">
            <Input value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="WELCOME10" className="h-9 rounded-lg border-[#E8E4D9] uppercase"
              data-testid="promo-input" />
            {promoState.status === "ok" ? (
              <Button type="button" size="sm" variant="outline" onClick={clearPromo} className="rounded-lg" data-testid="promo-clear">
                <X className="w-4 h-4" />
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={applyPromo} className="rounded-lg bg-[#6A7D64] text-white" data-testid="promo-apply">
                Apply
              </Button>
            )}
          </div>
          {promoState.message && (
            <div className={"text-xs mt-1 " + (promoState.status === "ok" ? "text-[#6A7D64]" : "text-red-600")} data-testid="promo-message">
              {promoState.status === "ok" && <Check className="inline w-3 h-3 mr-1" />}
              {promoState.message}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-[#7A736E]">Customer name</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
              className="h-9 rounded-lg border-[#E8E4D9]" data-testid="customer-name-input" placeholder="Jane" />
          </div>
          <div>
            <Label className="text-xs text-[#7A736E]">Phone (loyalty)</Label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
              className="h-9 rounded-lg border-[#E8E4D9]" data-testid="customer-phone-input" placeholder="+919876543210" />
          </div>
        </div>

        {loyaltyPoints > 0 && (
          <div className="rounded-lg bg-[#C97A7E]/10 px-3 py-2 text-xs text-[#2A2421]" data-testid="loyalty-banner">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#C97A7E]" />
                {loyaltyPoints.toFixed(2)} points available
              </span>
              <button type="button" onClick={() => setRedeemPoints(maxRedeem)} className="text-[#C97A7E] hover:underline font-semibold"
                data-testid="redeem-max-btn">
                Redeem max
              </button>
            </div>
            <Input type="number" min="0" max={loyaltyPoints} step="1" value={redeemPoints}
              onChange={(e) => setRedeemPoints(Math.min(maxRedeem, Math.max(0, Number(e.target.value) || 0)))}
              className="h-8 mt-2 rounded-md border-[#E8E4D9]" data-testid="redeem-input" placeholder="Points to redeem" />
          </div>
        )}

        <PaymentSplitter total={total} currency={currency} paymentMode={paymentMode}
          setPaymentMode={setPaymentMode} splits={splits} setSplits={setSplits}
          splitEnabled={splitEnabled} setSplitEnabled={setSplitEnabled} />

        <div className="space-y-1 text-sm pt-2 border-t border-dashed border-[#E8E4D9]">
          <Line label="Subtotal" value={`${c}${subtotal.toFixed(2)}`} testid="subtotal" />
          {Number(discount) > 0 && <Line label="Discount" value={`- ${c}${Number(discount).toFixed(2)}`} />}
          {promoDiscount > 0 && <Line label={`Promo (${promoCode})`} value={`- ${c}${promoDiscount.toFixed(2)}`} />}
          {Number(redeemPoints) > 0 && <Line label="Loyalty redeemed" value={`- ${c}${Number(redeemPoints).toFixed(2)}`} />}
          {Number(taxPercent) > 0 && <Line label={`Tax (${taxPercent}%)`} value={`${c}${taxAmount.toFixed(2)}`} />}
          {Number(servicePercent) > 0 && <Line label={`Service (${servicePercent}%)`} value={`${c}${serviceAmount.toFixed(2)}`} />}
          {Number(tipAmount) > 0 && <Line label="Tip" value={`${c}${Number(tipAmount).toFixed(2)}`} />}
          <div className="flex justify-between pt-2 border-t border-[#E8E4D9] font-display font-bold text-lg text-[#2A2421]" data-testid="grand-total">
            <span>Total</span>
            <span className="tabular-nums">{c}{total.toFixed(2)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="outline" onClick={clear} disabled={cart.length === 0} className="rounded-xl border-[#E8E4D9]" data-testid="clear-cart-button">Clear</Button>
          <Button onClick={onGenerate} disabled={busy || cart.length === 0} className="rounded-xl bg-[#C97A7E] hover:bg-[#B56A6D] text-white font-semibold" data-testid="generate-bill-button">
            {busy ? "Generating…" : "Generate Bill"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CartRow({ item, c, onInc, onDec, onRemove, onSetDiscount }) {
  const [showDiscount, setShowDiscount] = useState(item.discount > 0);
  const lineTotal = Math.max(0, item.price * item.quantity - (Number(item.discount) || 0));
  return (
    <div className="bg-white rounded-xl p-3 border border-[#E8E4D9]" data-testid={`cart-item-${item.menu_item_id}`}>
      <div className="flex justify-between gap-2">
        <div className="flex-1">
          <div className="font-semibold text-sm text-[#2A2421]">{item.name}</div>
          <div className="text-xs text-[#7A736E]">{c}{item.price.toFixed(2)} each</div>
        </div>
        <button onClick={onRemove} className="text-[#7A736E] hover:text-red-600" data-testid={`remove-item-${item.menu_item_id}`}><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="w-7 h-7 rounded-full border-[#E8E4D9]" onClick={onDec} data-testid={`dec-${item.menu_item_id}`}><Minus className="w-3 h-3" /></Button>
          <span className="w-6 text-center font-semibold text-sm" data-testid={`qty-${item.menu_item_id}`}>{item.quantity}</span>
          <Button size="icon" variant="outline" className="w-7 h-7 rounded-full border-[#E8E4D9]" onClick={onInc} data-testid={`inc-${item.menu_item_id}`}><Plus className="w-3 h-3" /></Button>
        </div>
        <span className="font-bold text-[#2A2421] tabular-nums">{c}{lineTotal.toFixed(2)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {showDiscount ? (
          <div className="flex items-center gap-2 flex-1">
            <Tag className="w-3 h-3 text-[#C97A7E]" />
            <Input type="number" min="0" step="1" value={item.discount || 0}
              onChange={(e) => onSetDiscount(e.target.value)} placeholder="0"
              className="h-7 text-xs rounded-md border-[#E8E4D9] py-0"
              data-testid={`item-discount-${item.menu_item_id}`} />
            <button type="button" onClick={() => { onSetDiscount(0); setShowDiscount(false); }} className="text-xs text-[#7A736E] hover:text-[#2A2421]">clear</button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowDiscount(true)} className="text-xs text-[#C97A7E] hover:underline flex items-center gap-1"
            data-testid={`item-add-discount-${item.menu_item_id}`}>
            <Tag className="w-3 h-3" /> Add item discount
          </button>
        )}
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, testid, step = "0.5" }) {
  return (
    <div>
      <Label className="text-xs text-[#7A736E]">{label}</Label>
      <Input type="number" min="0" step={step} value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border-[#E8E4D9]" data-testid={testid} />
    </div>
  );
}

function Line({ label, value, testid }) {
  return (
    <div className="flex justify-between" data-testid={testid}>
      <span className="text-[#7A736E]">{label}</span>
      <span className="font-medium text-[#2A2421] tabular-nums">{value}</span>
    </div>
  );
}
