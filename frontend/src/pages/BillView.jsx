import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import Receipt from "@/components/Receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Printer, Download, Ban, MessageCircle, CreditCard, ChefHat } from "lucide-react";
import { downloadBillPdf } from "@/lib/pdf";
import { toast } from "sonner";

export default function BillView() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [bill, setBill] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [waOpen, setWaOpen] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [paying, setPaying] = useState(false);
  const [polling, setPolling] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/bills/${id}`);
      setBill(r.data);
      if (r.data.customer_phone) setWhatsappPhone(r.data.customer_phone);
    } catch (_) { toast.error("Failed to load bill"); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Handle Stripe return → poll for status
  useEffect(() => {
    const sid = searchParams.get("session_id");
    if (!sid || polling) return;
    setPolling(true);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      if (attempts > 8) { clearInterval(interval); setPolling(false); return; }
      try {
        const r = await axios.get(`${API}/payments/status/${sid}`);
        if (r.data.payment_status === "paid") {
          toast.success("Payment received");
          clearInterval(interval);
          setPolling(false);
          searchParams.delete("session_id");
          setSearchParams(searchParams);
          load();
        } else if (r.data.status === "expired") {
          toast.error("Payment session expired");
          clearInterval(interval);
          setPolling(false);
        }
      } catch (_) {}
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleVoid = async () => {
    setVoiding(true);
    try {
      const r = await axios.post(`${API}/bills/${id}/void`, { reason: voidReason });
      setBill(r.data); toast.success("Bill voided");
    } catch (e) { toast.error(e.response?.data?.detail || "Void failed"); }
    finally { setVoiding(false); }
  };

  const sendWhatsApp = async () => {
    const phone = whatsappPhone.trim();
    if (!phone.startsWith("+")) { toast.error("Phone must start with + and country code"); return; }
    setWaSending(true);
    try {
      const r = await axios.post(`${API}/bills/${id}/whatsapp`, { phone });
      toast.success(`WhatsApp queued — ${r.data.status}`);
      setWaOpen(false);
    } catch (e) { toast.error(e.response?.data?.detail || "WhatsApp send failed"); }
    finally { setWaSending(false); }
  };

  const stripePay = async () => {
    setPaying(true);
    try {
      const r = await axios.post(`${API}/payments/checkout/${id}`);
      window.location.href = r.data.url;
    } catch (e) { toast.error(e.response?.data?.detail || "Could not start payment"); setPaying(false); }
  };

  if (!bill) return <div className="p-8 text-[#7A736E]">Loading…</div>;
  const isAdmin = user?.role === "admin";
  const paid = bill.payment_status === "paid";

  return (
    <div className="h-full overflow-y-auto scroll-soft">
      <div className="px-6 sm:px-8 py-6 max-w-3xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 no-print">
          <Link to="/bills"><Button variant="ghost" className="text-[#7A736E]" data-testid="back-to-bills"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Bills</Button></Link>
          <div className="flex items-center gap-2">
            {paid && <Badge className="bg-[#6A7D64] text-white" data-testid="paid-badge">PAID</Badge>}
            {polling && <Badge variant="secondary">Checking payment…</Badge>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6 no-print">
          <Button variant="outline" onClick={() => window.print()} className="rounded-xl border-[#E8E4D9]" data-testid="bill-print-button">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          <Button onClick={() => downloadBillPdf(bill)} className="rounded-xl bg-[#6A7D64] hover:bg-[#586A53] text-white" data-testid="bill-download-button">
            <Download className="w-4 h-4 mr-2" /> PDF
          </Button>
          <Link to={`/bills/${bill.id}/kot`} target="_blank" rel="noreferrer">
            <Button variant="outline" className="rounded-xl border-[#E8E4D9]" data-testid="bill-kot-button">
              <ChefHat className="w-4 h-4 mr-2" /> KOT
            </Button>
          </Link>

          <Dialog open={waOpen} onOpenChange={setWaOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50" data-testid="bill-whatsapp-button">
                <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E8E4D9] rounded-2xl">
              <DialogHeader><DialogTitle>Send bill via WhatsApp</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <Label>Customer phone (E.164)</Label>
                <Input value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)}
                  placeholder="+14155551234" className="rounded-xl border-[#E8E4D9]" data-testid="wa-phone-input" />
                <p className="text-xs text-[#7A736E]">Requires Twilio WhatsApp credentials in backend .env.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setWaOpen(false)} className="rounded-xl border-[#E8E4D9]">Cancel</Button>
                <Button onClick={sendWhatsApp} disabled={waSending} className="rounded-xl bg-emerald-600 text-white" data-testid="wa-send-button">
                  {waSending ? "Sending…" : "Send"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {!paid && !bill.voided && (
            <Button onClick={stripePay} disabled={paying} className="rounded-xl bg-[#635BFF] hover:bg-[#5247E4] text-white" data-testid="bill-stripe-button">
              <CreditCard className="w-4 h-4 mr-2" /> {paying ? "Opening…" : "Pay with Stripe"}
            </Button>
          )}

          {isAdmin && !bill.voided && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="rounded-xl border-red-200 text-red-600 hover:bg-red-50" data-testid="bill-void-button">
                  <Ban className="w-4 h-4 mr-2" /> Void
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-white border-[#E8E4D9] rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Void bill {bill.bill_number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The bill is marked voided, stock is restored, loyalty / promo uses reversed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-1">
                  <Label className="text-xs text-[#7A736E]">Reason (optional)</Label>
                  <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
                    className="rounded-xl border-[#E8E4D9]" placeholder="customer cancelled"
                    data-testid="bill-void-reason" />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleVoid} disabled={voiding}
                    className="rounded-xl bg-red-600 hover:bg-red-700 text-white" data-testid="bill-void-confirm">
                    {voiding ? "Voiding…" : "Void"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <Receipt bill={bill} />
      </div>
    </div>
  );
}
