import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sparkles, UserCircle } from "lucide-react";

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setCustomers((await axios.get(`${API}/customers`)).data); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="h-full overflow-y-auto scroll-soft">
      <div className="px-6 sm:px-8 py-6 max-w-6xl mx-auto">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#2A2421]">Customers</h1>
        <p className="text-sm text-[#7A736E] mt-1">Auto-created on first bill with a phone number. 1% of every net spend becomes loyalty points.</p>

        <Card className="mt-6 bg-white border-[#E8E4D9] rounded-2xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E8E4D9]">
                <TableHead className="text-xs uppercase tracking-wider text-[#7A736E]">Customer</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-[#7A736E]">Phone</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-[#7A736E]">Visits</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-[#7A736E]">Total Spent</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-[#7A736E]">Points</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-[#7A736E]">Last Visit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-[#7A736E] py-8">Loading…</TableCell></TableRow>
              ) : customers.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-[#7A736E] py-12" data-testid="customers-empty">No customers yet.</TableCell></TableRow>
              ) : customers.map((c) => (
                <TableRow key={c.id} className="border-[#E8E4D9]" data-testid={`customer-row-${c.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserCircle className="w-4 h-4 text-[#7A736E]" />
                      <span className="font-medium text-[#2A2421]">{c.name || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                  <TableCell>{c.visits}</TableCell>
                  <TableCell className="tabular-nums">₹{c.total_spent.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-[#C97A7E]/15 text-[#C97A7E]">
                      <Sparkles className="w-3 h-3 mr-1" /> {c.points.toFixed(2)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-[#7A736E]">{c.last_visit ? new Date(c.last_visit).toLocaleDateString() : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
