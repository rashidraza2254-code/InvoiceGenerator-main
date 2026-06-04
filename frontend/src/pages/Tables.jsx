import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API, useAuth } from "@/App";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Coffee, Users, QrCode, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const empty = { name: "", capacity: 2 };

function qrCodeUrl(data, size = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&margin=10&format=png`;
}

function QRDialog({ table, restaurantId }) {
  const [open, setOpen] = useState(false);
  const orderUrl = `${window.location.origin}/order/${restaurantId}/${table.id}`;
  const qr = qrCodeUrl(orderUrl, 250);

  const download = () => {
    const a = document.createElement("a");
    a.href = qrCodeUrl(orderUrl, 400);
    a.download = `QR-Table-${table.name}.png`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="mt-2 w-full text-[#7A736E] border-[#E8E4D9] rounded-lg text-xs" data-testid={`qr-table-${table.id}`}>
          <QrCode className="w-3 h-3 mr-1" /> QR Code
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white border-[#E8E4D9] rounded-2xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Table {table.name} — QR Menu</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <img src={qr} alt={`QR code for table ${table.name}`} className="rounded-xl border border-[#E8E4D9] shadow-sm" width={250} height={250} />
          <p className="text-xs text-[#7A736E] text-center break-all px-2">{orderUrl}</p>
          <p className="text-xs text-[#7A736E] text-center">Customers scan this to view the menu and place orders from their phone.</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => window.open(orderUrl, "_blank")} className="rounded-xl border-[#E8E4D9]">
            <ExternalLink className="w-4 h-4 mr-2" /> Preview
          </Button>
          <Button onClick={download} className="rounded-xl bg-[#6A7D64] hover:bg-[#586A53] text-white">
            <Download className="w-4 h-4 mr-2" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Tables() {
  const { user } = useAuth();
  const [tables, setTables] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const restaurantId = user?.restaurant_id || "default";

  const load = useCallback(async () => {
    try { setTables((await axios.get(`${API}/tables`)).data); }
    catch (_) { toast.error("Failed to load"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name) { toast.error("Name required"); return; }
    try {
      await axios.post(`${API}/tables`, { name: form.name, capacity: Number(form.capacity || 2) });
      setOpen(false); setForm(empty); load();
      toast.success("Table added");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const del = async (id) => {
    try { await axios.delete(`${API}/tables/${id}`); toast.success("Deleted"); load(); }
    catch (_) { toast.error("Delete failed"); }
  };

  return (
    <div className="h-full overflow-y-auto scroll-soft">
      <div className="px-6 sm:px-8 py-6 max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#2A2421]">Tables</h1>
            <p className="text-sm text-[#7A736E] mt-1">Assign orders to tables. Print QR codes for customer self-ordering.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl bg-[#C97A7E] hover:bg-[#B56A6D] text-white" data-testid="add-table-button">
                <Plus className="w-4 h-4 mr-2" /> Add Table
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E8E4D9] rounded-2xl">
              <DialogHeader><DialogTitle className="font-display text-2xl">New Table</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="rounded-xl border-[#E8E4D9]" data-testid="table-form-name" placeholder="T1, Patio 2, Bar..." />
                </div>
                <div>
                  <Label>Capacity</Label>
                  <Input type="number" min="1" step="1" value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    className="rounded-xl border-[#E8E4D9]" data-testid="table-form-capacity" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl border-[#E8E4D9]">Cancel</Button>
                <Button onClick={save} className="rounded-xl bg-[#C97A7E] text-white" data-testid="table-form-save">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {tables.length === 0 ? (
          <div className="text-center text-[#7A736E] py-20" data-testid="tables-empty">
            No tables defined. Add one to start tracking orders by table.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {tables.map((t) => {
              const occupied = t.status === "occupied";
              return (
                <Card
                  key={t.id}
                  className={"p-4 rounded-2xl border " + (occupied ? "bg-[#C97A7E]/10 border-[#C97A7E]/40" : "bg-white border-[#E8E4D9]")}
                  data-testid={`table-card-${t.id}`}
                >
                  <div className="flex items-center justify-between">
                    <Coffee className="w-5 h-5 text-[#C97A7E]" />
                    <Badge variant="secondary" className={occupied ? "bg-[#C97A7E] text-white" : "bg-[#6A7D64]/15 text-[#6A7D64]"}>
                      {occupied ? "Occupied" : "Free"}
                    </Badge>
                  </div>
                  <div className="mt-3 font-display font-bold text-2xl text-[#2A2421]">{t.name}</div>
                  <div className="flex items-center gap-1 text-xs text-[#7A736E] mt-1">
                    <Users className="w-3 h-3" /> {t.capacity}
                  </div>

                  <QRDialog table={t} restaurantId={restaurantId} />

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="mt-1 w-full text-red-600 hover:bg-red-50" data-testid={`delete-table-${t.id}`}>
                        <Trash2 className="w-3 h-3 mr-1" /> Remove
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-white border-[#E8E4D9] rounded-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove table &quot;{t.name}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>Existing bill records keep the table name.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => del(t.id)} className="rounded-xl bg-red-600 text-white">Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
