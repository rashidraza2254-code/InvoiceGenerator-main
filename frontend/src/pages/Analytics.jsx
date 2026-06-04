import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { TrendingUp, ReceiptText, Coins, Ban, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const PIE_COLORS = ["#C97A7E", "#6A7D64", "#D2A464", "#7A736E", "#B56A6D"];

const RANGES = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lowStock, setLowStock] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, ls] = await Promise.all([
        axios.get(`${API}/analytics?days=${days}`),
        axios.get(`${API}/menu/low-stock`),
      ]);
      setData(a.data);
      setLowStock(ls.data);
    } catch (e) {
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-full overflow-y-auto scroll-soft">
      <div className="px-6 sm:px-8 py-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#2A2421]">Analytics</h1>
            <p className="text-sm text-[#7A736E] mt-1">Revenue, top items, and payment trends. Voided bills excluded.</p>
          </div>
          <div className="flex gap-1 bg-white border border-[#E8E4D9] rounded-xl p-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setDays(r.value)}
                data-testid={`range-${r.value}`}
                className={
                  "px-3 py-1.5 text-sm rounded-lg font-medium transition-colors " +
                  (days === r.value
                    ? "bg-[#C97A7E] text-white"
                    : "text-[#7A736E] hover:bg-[#F5F2EA]")
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading || !data ? (
          <div className="text-center py-20 text-[#7A736E]">Loading analytics…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Revenue"
                value={`₹${data.summary.total_revenue.toFixed(2)}`}
                icon={TrendingUp}
                testid="kpi-revenue"
              />
              <StatCard
                label="Total Bills"
                value={data.summary.total_bills}
                icon={ReceiptText}
                testid="kpi-bills"
              />
              <StatCard
                label="Avg Ticket"
                value={`₹${data.summary.avg_bill.toFixed(2)}`}
                icon={Coins}
                testid="kpi-avg"
              />
              <StatCard
                label="Voided Bills"
                value={data.summary.voided_count}
                icon={Ban}
                testid="kpi-voided"
              />
            </div>

            <Card className="mt-6 bg-white border-[#E8E4D9] rounded-2xl p-5" data-testid="chart-revenue">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-display font-bold text-lg text-[#2A2421]">Daily revenue (last {days} days)</h2>
                <span className="text-xs text-[#7A736E]">
                  Σ ₹{data.revenue_by_day.reduce((s, d) => s + d.total, 0).toFixed(2)}
                </span>
              </div>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <AreaChart data={data.revenue_by_day} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#C97A7E" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#C97A7E" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E4D9" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#7A736E", fontSize: 11 }}
                      tickFormatter={(d) => d.slice(5)}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fill: "#7A736E", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #E8E4D9",
                        borderRadius: 12,
                      }}
                      labelStyle={{ color: "#2A2421", fontWeight: 600 }}
                      formatter={(v, k) => (k === "total" ? [`₹${Number(v).toFixed(2)}`, "Revenue"] : [v, k])}
                    />
                    <Area type="monotone" dataKey="total" stroke="#C97A7E" strokeWidth={2} fill="url(#rev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
              <Card className="bg-white border-[#E8E4D9] rounded-2xl p-5" data-testid="chart-top-items">
                <h2 className="font-display font-bold text-lg text-[#2A2421] mb-2">Top items by revenue</h2>
                {data.top_items.length === 0 ? (
                  <div className="text-sm text-[#7A736E] py-8 text-center">No data yet.</div>
                ) : (
                  <div style={{ width: "100%", height: 280 }}>
                    <ResponsiveContainer>
                      <BarChart data={data.top_items} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E8E4D9" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#7A736E", fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" tick={{ fill: "#2A2421", fontSize: 11 }} width={100} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "white", border: "1px solid #E8E4D9", borderRadius: 12 }}
                          formatter={(v) => `₹${Number(v).toFixed(2)}`}
                        />
                        <Bar dataKey="revenue" fill="#6A7D64" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card className="bg-white border-[#E8E4D9] rounded-2xl p-5" data-testid="chart-payments">
                <h2 className="font-display font-bold text-lg text-[#2A2421] mb-2">Payment mode breakdown</h2>
                {data.payment_breakdown.length === 0 ? (
                  <div className="text-sm text-[#7A736E] py-8 text-center">No data yet.</div>
                ) : (
                  <div style={{ width: "100%", height: 280 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={data.payment_breakdown}
                          dataKey="total"
                          nameKey="mode"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={2}
                          stroke="#FDFBF7"
                          strokeWidth={2}
                        >
                          {data.payment_breakdown.map((entry, idx) => (
                            <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: "white", border: "1px solid #E8E4D9", borderRadius: 12 }}
                          formatter={(v) => `₹${Number(v).toFixed(2)}`}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 12, color: "#2A2421" }}
                          formatter={(value, entry) => {
                            const p = entry?.payload;
                            return p ? `${p.mode} — ₹${p.total.toFixed(0)}` : value;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>

            <Card className="mt-6 bg-white border-[#E8E4D9] rounded-2xl p-5" data-testid="top-items-table">
              <h2 className="font-display font-bold text-lg text-[#2A2421] mb-3">Top items breakdown</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.top_items.map((it, idx) => (
                  <div
                    key={it.name}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#F5F2EA]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-white text-[#C97A7E] text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-[#2A2421]">{it.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-[#2A2421] tabular-nums">₹{it.revenue.toFixed(2)}</div>
                      <div className="text-xs text-[#7A736E]">{it.qty} sold</div>
                    </div>
                  </div>
                ))}
                {data.top_items.length === 0 && (
                  <div className="col-span-full text-center text-[#7A736E] py-4">No items sold yet.</div>
                )}
              </div>
            </Card>

            <Card className="mt-6 bg-white border-[#E8E4D9] rounded-2xl p-5" data-testid="low-stock-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-bold text-lg text-[#2A2421] flex items-center gap-2">
                  <Package className="w-5 h-5 text-[#C97A7E]" />
                  Low stock alerts
                </h2>
                <span className="text-xs text-[#7A736E]">{lowStock.length} item{lowStock.length !== 1 && "s"}</span>
              </div>
              {lowStock.length === 0 ? (
                <div className="text-sm text-[#7A736E] py-4 text-center">All tracked items are above their thresholds. 🎉</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {lowStock.map((it) => {
                    const out = it.stock === 0;
                    return (
                      <div
                        key={it.id}
                        className={
                          "flex items-center justify-between px-3 py-2 rounded-lg " +
                          (out ? "bg-red-50" : "bg-amber-50")
                        }
                        data-testid={`low-stock-${it.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <AlertTriangle className={"w-4 h-4 " + (out ? "text-red-600" : "text-amber-600")} />
                          <div>
                            <div className="font-medium text-[#2A2421]">{it.name}</div>
                            <div className="text-xs text-[#7A736E]">{it.category} · alert at {it.low_stock_threshold}</div>
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className={out ? "bg-red-600 text-white" : "bg-amber-600 text-white"}
                        >
                          {out ? "Sold out" : `${it.stock} left`}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        )}
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
