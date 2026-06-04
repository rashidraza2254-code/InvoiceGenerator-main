import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Printer, Download, ChefHat } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import Receipt from "@/components/Receipt";
import CartPanel from "@/components/CartPanel";
import MenuItemCard from "@/components/MenuItemCard";
import useCart from "@/hooks/useCart";
import useMenu from "@/hooks/useMenu";
import { downloadBillPdf } from "@/lib/pdf";

export default function POS() {
  const { cart, pulseId, addToCart, inc, dec, removeItem, setItemDiscount, clear, subtotal, cartQtyByItem } = useCart();
  const { categories, filterMenu, reload: reloadMenu } = useMenu();

  const [settings, setSettings] = useState(null);
  const [tables, setTables] = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [discount, setDiscount] = useState(0);
  const [tipAmount, setTipAmount] = useState(0);
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splits, setSplits] = useState([]);
  const [tableId, setTableId] = useState(null);
  const [taxPercent, setTaxPercent] = useState(5);
  const [servicePercent, setServicePercent] = useState(10);
  const [busy, setBusy] = useState(false);
  const [generatedBill, setGeneratedBill] = useState(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const loadBootstrap = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([axios.get(`${API}/settings`), axios.get(`${API}/tables`)]);
      setSettings(s.data);
      setTaxPercent(s.data.tax_percent);
      setServicePercent(s.data.service_percent);
      setTables(t.data || []);
    } catch (_) {}
  }, []);

  useEffect(() => { loadBootstrap(); }, [loadBootstrap]);

  const filteredMenu = useMemo(() => filterMenu(activeCategory, search), [filterMenu, activeCategory, search]);

  const afterDiscount = Math.max(0, subtotal - Number(discount || 0) - promoDiscount - Number(redeemPoints || 0));
  const taxAmount = (afterDiscount * Number(taxPercent || 0)) / 100;
  const serviceAmount = (afterDiscount * Number(servicePercent || 0)) / 100;
  const total = afterDiscount + taxAmount + serviceAmount + Number(tipAmount || 0);
  const currency = settings?.currency || "INR";

  const resetForm = useCallback(() => {
    clear();
    setDiscount(0); setTipAmount(0);
    setPromoCode(""); setPromoDiscount(0);
    setCustomerName(""); setCustomerPhone("");
    setLoyaltyPoints(0); setRedeemPoints(0);
    setPaymentMode("Cash"); setSplitEnabled(false); setSplits([]);
    setTableId(null);
  }, [clear]);

  const generateBill = async () => {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    if (splitEnabled) {
      const sum = splits.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (Math.abs(sum - total) > 0.01) { toast.error(`Split payments must sum to ${total.toFixed(2)}`); return; }
    }
    setBusy(true);
    try {
      const body = {
        items: cart.map((i) => ({
          menu_item_id: i.menu_item_id, name: i.name, price: i.price,
          quantity: i.quantity, discount: Number(i.discount) || 0,
        })),
        tax_percent: Number(taxPercent || 0),
        service_percent: Number(servicePercent || 0),
        discount_amount: Number(discount || 0),
        tip_amount: Number(tipAmount || 0),
        customer_name: customerName,
        customer_phone: customerPhone,
        payment_mode: paymentMode,
        promo_code: promoCode,
        loyalty_points_redeemed: Number(redeemPoints || 0),
        table_id: tableId,
      };
      if (splitEnabled) body.payments = splits.map((p) => ({ mode: p.mode, amount: Number(p.amount) }));
      const res = await axios.post(`${API}/bills`, body);
      setGeneratedBill(res.data);
      setReceiptOpen(true);
      reloadMenu();
      loadBootstrap();
      toast.success(`Bill ${res.data.bill_number} created`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create bill");
    } finally { setBusy(false); }
  };

  const closeReceipt = () => { setReceiptOpen(false); resetForm(); setGeneratedBill(null); };

  return (
    <div className="h-screen md:h-screen flex flex-col overflow-hidden">
      <div className="px-6 sm:px-8 pt-6 pb-3">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#2A2421]">Point of Sale</h1>
        <p className="text-sm text-[#7A736E] mt-1">Browse the menu, build the order, and print the bill.</p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 px-6 sm:px-8 pb-6 overflow-hidden">
        <div className="lg:col-span-2 flex flex-col bg-white rounded-2xl border border-[#E8E4D9] overflow-hidden">
          <div className="p-4 border-b border-[#E8E4D9] flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7A736E]" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search menu…" className="pl-9 rounded-xl border-[#E8E4D9] focus-visible:ring-[#C97A7E]"
                data-testid="menu-search-input" />
            </div>
          </div>
          <Tabs value={activeCategory} onValueChange={setActiveCategory} className="flex flex-col flex-1 overflow-hidden">
            <div className="px-4 pt-3 border-b border-[#E8E4D9] overflow-x-auto scroll-soft">
              <TabsList className="bg-transparent gap-1">
                {categories.map((cat) => (
                  <TabsTrigger key={cat} value={cat} data-testid={`category-tab-${cat}`}
                    className="rounded-full data-[state=active]:bg-[#C97A7E] data-[state=active]:text-white capitalize">
                    {cat}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <TabsContent value={activeCategory} className="flex-1 overflow-y-auto scroll-soft p-4 mt-0">
              {filteredMenu.length === 0 ? (
                <div className="text-center text-[#7A736E] py-12">No items found.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredMenu.map((item) => (
                    <MenuItemCard key={item.id} item={item} currency={currency}
                      pulse={pulseId === item.id} onAdd={addToCart}
                      cartQty={cartQtyByItem[item.id] || 0} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <CartPanel
          cart={cart} inc={inc} dec={dec} removeItem={removeItem}
          setItemDiscount={setItemDiscount} clear={resetForm} subtotal={subtotal}
          taxPercent={taxPercent} setTaxPercent={setTaxPercent}
          servicePercent={servicePercent} setServicePercent={setServicePercent}
          discount={discount} setDiscount={setDiscount}
          tipAmount={tipAmount} setTipAmount={setTipAmount}
          promoCode={promoCode} setPromoCode={setPromoCode}
          promoDiscount={promoDiscount} setPromoDiscount={setPromoDiscount}
          customerName={customerName} setCustomerName={setCustomerName}
          customerPhone={customerPhone} setCustomerPhone={setCustomerPhone}
          loyaltyPoints={loyaltyPoints} setLoyaltyPoints={setLoyaltyPoints}
          redeemPoints={redeemPoints} setRedeemPoints={setRedeemPoints}
          paymentMode={paymentMode} setPaymentMode={setPaymentMode}
          splits={splits} setSplits={setSplits}
          splitEnabled={splitEnabled} setSplitEnabled={setSplitEnabled}
          tableId={tableId} setTableId={setTableId} tables={tables}
          total={total} taxAmount={taxAmount} serviceAmount={serviceAmount}
          currency={currency} busy={busy} onGenerate={generateBill} />
      </div>

      <Dialog open={receiptOpen} onOpenChange={(o) => { if (!o) closeReceipt(); }}>
        <DialogContent className="max-w-md sm:max-w-lg bg-[#FDFBF7] border-[#E8E4D9] rounded-2xl">
          <DialogHeader className="no-print">
            <DialogTitle className="font-display text-2xl text-[#2A2421]">Bill Generated</DialogTitle>
          </DialogHeader>
          {generatedBill && <Receipt bill={generatedBill} />}
          <DialogFooter className="no-print gap-2 sm:gap-2 flex-row flex-wrap">
            <Button variant="outline" onClick={() => window.print()} className="rounded-xl border-[#E8E4D9] flex-1" data-testid="print-bill-button">
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
            <Button onClick={() => generatedBill && downloadBillPdf(generatedBill)} className="rounded-xl bg-[#6A7D64] hover:bg-[#586A53] text-white flex-1" data-testid="download-pdf-button">
              <Download className="w-4 h-4 mr-2" /> PDF
            </Button>
            {generatedBill && (
              <Link to={`/bills/${generatedBill.id}/kot`} target="_blank" rel="noreferrer">
                <Button variant="outline" className="rounded-xl border-[#E8E4D9]" data-testid="kot-button">
                  <ChefHat className="w-4 h-4 mr-2" /> KOT
                </Button>
              </Link>
            )}
            <Button variant="ghost" onClick={closeReceipt} className="rounded-xl" data-testid="new-bill-button">New Bill</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
