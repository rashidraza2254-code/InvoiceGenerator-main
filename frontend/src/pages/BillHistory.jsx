import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, TrendingUp, Receipt as ReceiptIcon, Download, FilterX } from "lucide-react";
import { currencyToSymbol } from "@/lib/pdf";
import { toast } from "sonner";

const PAYMENT_OPTIONS = ["all", "Cash", "Card", "UPI", "Other"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function BillHistory() {
  const [bills, setBills] = useState([]);
  const [stats, setStats] = useState({ today_total: 0, today_count: 0, grand_total: 0, total_count: 0 });
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [paymentMode, setPaymentMode] = useState("all");

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (fromDate) p.append("from_date", fromDate);
    if (toDate) p.append("to_date", toDate);
    if (paymentMode && paymentMode !== "all") p.append("payment_mode", paymentMode);
    return p.toString();
  }, [fromDate, toDate, paymentMode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([
        axios.get(`${API}/bills${params ? `?${params}` : ""}`),
        axios.get(`${API}/stats/summary`),
      ]);
      setBills(b.data);
      setStats(s.data);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTotals = useMemo(() => {
    const total = bills.reduce((s, b) => s + (b.total || 0), 0);
    return { count: bills.length, total };
  }, [bills]);

  const clearFilters = () => {
    setFromDate("");
    setToDate("");
    setPaymentMode("all");
  };

  const setToday = () => {
    const d = todayISO();
    setFromDate(d);
    setToDate(d);
  };

  const handleExport = async () => {
    try {
      const res = await axios.get(`${API}/bills/export${params ? `?${params}` : ""}`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bills_${fromDate || "all"}_${toDate || "all"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (_) {
      toast.error("Export failed");
    }
  };

  return (
    <div className="h-full overflow-y-auto scroll-soft">
      <div className="px-6 sm:px-8 py-6 max-w-7xl mx-auto">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#2A2421]">Bill History</h1>
        <p className="text-sm text-[#7A736E] mt-1">All transactions, most recent first.</p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <StatCard label="Today's Sales" value={`₹${stats.today_total.toFixed(2)}`} icon={TrendingUp} testid="stat-today-total" />
          <StatCard label="Today's Bills" value={stats.today_count} icon={ReceiptIcon} testid="stat-today-count" />
          <StatCard label="Lifetime Sales" value={`₹${stats.grand_total.toFixed(2)}`} icon={TrendingUp} testid="stat-grand-total" />
          <StatCard label="Total Bills" value={stats.total_count} icon={ReceiptIcon} testid="stat-total-count" />
        </div>

        <Card className="mt-6 bg-white border-[#E8E4D9] rounded-2xl p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-[#7A736E]">From</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 rounded-lg border-[#E8E4D9]"
                data-testid="filter-from-date"
              />
            </div>
            <div>
              <Label className="text-xs text-[#7A736E]">To</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 rounded-lg border-[#E8E4D9]"
                data-testid="filter-to-date"
              />
            </div>
            <div>
              <Label className="text-xs text-[#7A736E]">Payment</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger className="h-9 rounded-lg border-[#E8E4D9] w-32" data-testid="filter-payment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m === "all" ? "All" : m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={setToday} className="rounded-lg border-[#E8E4D9]" data-testid="filter-today">
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="rounded-lg border-[#E8E4D9]"
                data-testid="filter-clear"
              >
                <FilterX className="w-4 h-4 mr-1" /> Clear
              </Button>
              <Button
                onClick={handleExport}
                size="sm"
                className="rounded-lg bg-[#6A7D64] hover:bg-[#586A53] text-white"
                data-testid="export-csv-button"
              >
                <Download className="w-4 h-4 mr-1" /> Export CSV
              </Button>
            </div>
          </div>
          <div className="text-xs text-[#7A736E] mt-3" data-testid="filter-summary">
            Showing <span className="font-semibold text-[#2A2421]">{filteredTotals.count}</span> bill(s) · total ₹
            <span className="font-semibold text-[#2A2421]">{filteredTotals.total.toFixed(2)}</span>
          </div>
        </Card>

        <Card className="mt-6 bg-white border-[#E8E4D9] rounded-2xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E8E4D9]">
                <TableHead className="text-[#7A736E] uppercase tracking-wider text-xs">Bill #</TableHead>
                <TableHead className="text-[#7A736E] uppercase tracking-wider text-xs">Date</TableHead>
                <TableHead className="text-[#7A736E] uppercase tracking-wider text-xs">Customer</TableHead>
                <TableHead className="text-[#7A736E] uppercase tracking-wider text-xs">Items</TableHead>
                <TableHead className="text-[#7A736E] uppercase tracking-wider text-xs">Payment</TableHead>
                <TableHead className="text-[#7A736E] uppercase tracking-wider text-xs text-right">Total</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-[#7A736E] py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : bills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-[#7A736E] py-12" data-testid="bills-empty">
                    No bills match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                bills.map((b) => {
                  const c = currencyToSymbol(b.currency);
                  const payments = b.payments || [];
                  const isSplit = payments.length > 1;
                  const payLabel = isSplit
                    ? `Split (${payments.length})`
                    : b.payment_mode || "Cash";
                  return (
                    <TableRow
                      key={b.id}
                      className={"border-[#E8E4D9] " + (b.voided ? "opacity-60" : "")}
                      data-testid={`bill-row-${b.id}`}
                    >
                      <TableCell className="font-mono text-sm text-[#2A2421]">
                        <div className="flex items-center gap-2">
                          <span className={b.voided ? "line-through" : ""}>{b.bill_number}</span>
                          {b.voided && (
                            <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]" data-testid={`voided-badge-${b.id}`}>
                              VOID
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{new Date(b.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{b.customer_name || "—"}</TableCell>
                      <TableCell className="text-sm">{b.items.reduce((s, i) => s + i.quantity, 0)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-[#F5F2EA] text-[#2A2421]">
                          {payLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className={"text-right font-bold tabular-nums " + (b.voided ? "line-through" : "")}>
                        {c}
                        {b.total.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link to={`/bills/${b.id}`}>
                          <Button size="sm" variant="ghost" data-testid={`view-bill-${b.id}`}>
                            <Eye className="w-4 h-4 mr-1" /> View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, testid }) {
  return (
    <Card className="bg-white border-[#E8E4D9] rounded-2xl p-4" data-testid={testid}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-[#7A736E]">{label}</span>
        <Icon className="w-4 h-4 text-[#C97A7E]" />
      </div>
      <div className="mt-2 font-display font-bold text-2xl text-[#2A2421] tabular-nums">{value}</div>
    </Card>
  );
}
