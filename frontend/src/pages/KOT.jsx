import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Printer, ChefHat } from "lucide-react";

/**
 * Kitchen Order Ticket — items + qty only, no prices.
 * Auto-prints on load when ?autoprint=1.
 */
export default function KOT() {
  const { id } = useParams();
  const [bill, setBill] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/bills/${id}`);
      setBill(r.data);
    } catch (_) {}
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (bill && window.location.search.includes("autoprint=1")) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [bill]);

  if (!bill) return <div className="p-12 text-center text-[#7A736E]">Loading KOT…</div>;

  return (
    <div className="min-h-screen bg-[#FDFBF7] py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="flex justify-end mb-4 no-print">
          <Button onClick={() => window.print()} className="rounded-xl bg-[#2A2421] text-white" data-testid="kot-print-button">
            <Printer className="w-4 h-4 mr-2" /> Print KOT
          </Button>
        </div>
        <div className="printable bg-white rounded-2xl border-2 border-dashed border-[#2A2421] p-6 font-mono" data-testid="kot-card">
          <div className="text-center mb-3">
            <ChefHat className="w-8 h-8 mx-auto mb-1 text-[#2A2421]" />
            <div className="font-display font-black text-2xl tracking-widest">KITCHEN</div>
            <div className="text-xs text-[#7A736E]">Order Ticket</div>
          </div>
          <div className="border-t border-b border-dashed border-[#2A2421] py-2 my-3 text-sm">
            <div className="flex justify-between"><span>Bill:</span><span className="font-bold">{bill.bill_number}</span></div>
            <div className="flex justify-between"><span>Time:</span><span>{new Date(bill.created_at).toLocaleTimeString()}</span></div>
            {bill.table_name && <div className="flex justify-between"><span>Table:</span><span className="font-bold">{bill.table_name}</span></div>}
            {bill.customer_name && <div className="flex justify-between"><span>Customer:</span><span>{bill.customer_name}</span></div>}
          </div>
          <div className="space-y-2">
            {bill.items.map((it, idx) => (
              <div key={idx} className="flex items-center justify-between text-lg font-bold text-[#2A2421] border-b border-dotted border-[#E8E4D9] pb-2" data-testid={`kot-item-${idx}`}>
                <span className="flex-1">{it.name}</span>
                <span className="ml-3 px-3 py-1 rounded-md bg-[#2A2421] text-white text-xl">×{it.quantity}</span>
              </div>
            ))}
          </div>
          {bill.notes && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <div className="font-bold text-amber-800 mb-1">⚠ Notes</div>
              <div className="text-amber-900">{bill.notes}</div>
            </div>
          )}
          <div className="mt-4 text-xs text-center text-[#7A736E]">— END OF TICKET —</div>
        </div>
      </div>
    </div>
  );
}
