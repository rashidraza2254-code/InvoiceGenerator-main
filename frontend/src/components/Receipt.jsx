import React from "react";
import { currencyToSymbol } from "@/lib/pdf";

export default function Receipt({ bill }) {
  if (!bill) return null;
  const c = currencyToSymbol(bill.currency);
  const payments = bill.payments && bill.payments.length > 0
    ? bill.payments
    : [{ mode: bill.payment_mode || "Cash", amount: bill.total }];
  const isSplit = payments.length > 1;
  const gstType = bill.gst_type || "cgst_sgst";

  return (
    <div
      className={
        "printable bg-white text-[#2A2421] mx-auto rounded-2xl shadow-sm border border-[#E8E4D9] p-6 max-w-sm font-mono text-sm relative " +
        (bill.voided ? "opacity-90" : "")
      }
      data-testid="receipt-card"
    >
      {bill.voided && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
          <span className="text-red-500/40 font-display font-black text-7xl tracking-widest rotate-[-18deg] border-8 border-red-500/40 px-6 py-2 rounded-lg">
            VOID
          </span>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-3">
        <div className="font-display font-bold text-xl">{bill.cafe_name}</div>
        {bill.cafe_address && <div className="text-xs text-[#7A736E]">{bill.cafe_address}</div>}
        {bill.gstin && (
          <div className="text-xs text-[#7A736E] mt-1">
            <span className="font-semibold">GSTIN:</span> {bill.gstin}
          </div>
        )}
        {bill.gstin && (
          <div className="text-xs font-semibold mt-1 border border-[#2A2421] inline-block px-2 py-0.5 rounded">TAX INVOICE</div>
        )}
      </div>

      <div className="border-t border-dashed border-[#E8E4D9] my-2" />

      {/* Metadata */}
      <div className="text-xs text-[#7A736E] space-y-0.5">
        <div>
          Bill #: <span className="font-semibold text-[#2A2421]" data-testid="receipt-bill-number">{bill.bill_number}</span>
        </div>
        <div>Date: {new Date(bill.created_at).toLocaleString("en-IN")}</div>
        {bill.branch_name && <div>Branch: {bill.branch_name}</div>}
        {bill.table_name && <div>Table: <span className="font-semibold text-[#2A2421]">{bill.table_name}</span></div>}
        {bill.customer_name && <div>Customer: {bill.customer_name}{bill.customer_phone ? ` (${bill.customer_phone})` : ""}</div>}
        <div>Cashier: {bill.created_by}</div>
        {bill.payment_status === "paid" && <div className="text-[#6A7D64] font-semibold">PAID ✓</div>}
      </div>

      <div className="border-t border-dashed border-[#E8E4D9] my-2" />

      {/* Items */}
      <div className="space-y-1">
        {bill.items.map((it, idx) => (
          <div key={`${it.menu_item_id || it.name}-${idx}`} className="flex justify-between" data-testid={`receipt-item-${idx}`}>
            <div className="flex-1">
              <div>{it.name}{it.hsn_code ? <span className="text-xs text-[#7A736E] ml-1">HSN {it.hsn_code}</span> : null}</div>
              <div className="text-xs text-[#7A736E]">
                {it.quantity} × {c}{it.price.toFixed(2)}
                {it.discount > 0 && <span className="ml-1 text-[#C97A7E]">− {c}{it.discount.toFixed(2)}</span>}
              </div>
            </div>
            <div className="font-semibold tabular-nums">
              {c}{Math.max(0, it.price * it.quantity - (it.discount || 0)).toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-[#E8E4D9] my-2" />

      {/* Totals */}
      <div className="space-y-1">
        <Row label="Subtotal" value={`${c}${bill.subtotal.toFixed(2)}`} />
        {bill.discount_amount > 0 && <Row label="Discount" value={`- ${c}${bill.discount_amount.toFixed(2)}`} />}
        {bill.promo_discount > 0 && <Row label={`Promo${bill.promo_code ? ` (${bill.promo_code})` : ""}`} value={`- ${c}${bill.promo_discount.toFixed(2)}`} />}
        {bill.loyalty_points_redeemed > 0 && <Row label="Loyalty redeemed" value={`- ${c}${bill.loyalty_points_redeemed.toFixed(2)}`} />}

        {/* GST Breakdown */}
        {bill.tax_amount > 0 && gstType === "igst" && (
          <Row label={`IGST (${bill.tax_percent}%)`} value={`${c}${(bill.igst_amount || bill.tax_amount).toFixed(2)}`} />
        )}
        {bill.tax_amount > 0 && gstType !== "igst" && (
          <>
            <Row label={`CGST (${(bill.tax_percent / 2).toFixed(1)}%)`} value={`${c}${(bill.cgst_amount || bill.tax_amount / 2).toFixed(2)}`} />
            <Row label={`SGST (${(bill.tax_percent / 2).toFixed(1)}%)`} value={`${c}${(bill.sgst_amount || bill.tax_amount / 2).toFixed(2)}`} />
          </>
        )}

        {bill.service_amount > 0 && <Row label={`Service (${bill.service_percent}%)`} value={`${c}${bill.service_amount.toFixed(2)}`} />}
        {bill.tip_amount > 0 && <Row label="Tip" value={`${c}${bill.tip_amount.toFixed(2)}`} />}
      </div>

      <div className="border-t border-dashed border-[#E8E4D9] my-2" />

      {/* Total */}
      <div className="flex justify-between text-lg font-bold" data-testid="receipt-total">
        <span>TOTAL</span>
        <span className="tabular-nums">{c}{bill.total.toFixed(2)}</span>
      </div>

      {/* Payments */}
      <div className="mt-2 space-y-0.5" data-testid="receipt-payments">
        <div className="text-xs text-[#7A736E]">{isSplit ? "Split payments" : "Payment"}</div>
        {payments.map((p, idx) => (
          <div key={idx} className="flex justify-between text-xs">
            <span>{p.mode}</span>
            <span className="font-semibold tabular-nums">{c}{Number(p.amount).toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Void stamp */}
      {bill.voided && (
        <div className="mt-3 border-t border-dashed border-red-300 pt-2 text-xs text-red-600">
          <div>VOIDED at: {bill.voided_at && new Date(bill.voided_at).toLocaleString()}</div>
          <div>By: {bill.voided_by}</div>
          {bill.voided_reason && <div>Reason: {bill.voided_reason}</div>}
        </div>
      )}

      {/* Loyalty */}
      {bill.loyalty_points_earned > 0 && (
        <div className="mt-3 text-xs text-[#C97A7E] text-center bg-[#C97A7E]/10 py-2 rounded-lg" data-testid="receipt-loyalty">
          ✨ You earned <span className="font-bold">{bill.loyalty_points_earned.toFixed(0)} points</span> on this visit
        </div>
      )}

      {bill.notes && <div className="mt-3 text-xs text-[#7A736E]">Notes: {bill.notes}</div>}

      <div className="text-center text-xs text-[#7A736E] mt-4">
        {bill.receipt_footer || "Thank you! Please come again."}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[#7A736E]">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
