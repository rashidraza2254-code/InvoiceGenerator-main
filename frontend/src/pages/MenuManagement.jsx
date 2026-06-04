import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API } from "@/App";
import { Button } from "@/components/ui/button";
import { Plus, Coffee } from "lucide-react";
import { toast } from "sonner";
import MenuItemForm from "@/components/MenuItemForm";
import MenuItemRow from "@/components/MenuItemRow";

export default function MenuManagement() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/menu`);
      setItems(res.data);
    } catch (_) {
      toast.error("Failed to load menu");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (it) => {
    setEditing(it);
    setOpen(true);
  };

  const handleSave = async (payload) => {
    try {
      if (editing) {
        await axios.put(`${API}/menu/${editing.id}`, payload);
        toast.success("Item updated");
      } else {
        await axios.post(`${API}/menu`, payload);
        toast.success("Item created");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error("Save failed");
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/menu/${id}`);
      toast.success("Item deleted");
      load();
    } catch (_) {
      toast.error("Delete failed");
    }
  };

  const grouped = useMemo(() => {
    return items.reduce((acc, it) => {
      acc[it.category] = acc[it.category] || [];
      acc[it.category].push(it);
      return acc;
    }, {});
  }, [items]);

  return (
    <div className="h-full overflow-y-auto scroll-soft">
      <div className="px-6 sm:px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#2A2421]">Menu</h1>
            <p className="text-sm text-[#7A736E] mt-1">Manage items, prices, and categories.</p>
          </div>
          <Button
            onClick={openCreate}
            className="rounded-xl bg-[#C97A7E] hover:bg-[#B56A6D] text-white"
            data-testid="add-menu-item-button"
          >
            <Plus className="w-4 h-4 mr-2" /> Add Item
          </Button>
        </div>

        <MenuItemForm open={open} editing={editing} onClose={() => setOpen(false)} onSave={handleSave} />

        {Object.keys(grouped).length === 0 ? (
          <div className="text-center text-[#7A736E] py-20" data-testid="empty-menu">
            No items yet. Click &quot;Add Item&quot; to start.
          </div>
        ) : (
          <div className="space-y-8">
            {Object.keys(grouped)
              .sort()
              .map((cat) => (
                <section key={cat}>
                  <div className="flex items-center gap-3 mb-3">
                    <Coffee className="w-4 h-4 text-[#C97A7E]" />
                    <h2 className="font-display font-bold text-lg text-[#2A2421] tracking-tight">{cat}</h2>
                    <span className="text-xs text-[#7A736E]">({grouped[cat].length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {grouped[cat].map((it) => (
                      <MenuItemRow key={it.id} item={it} onEdit={openEdit} onDelete={handleDelete} />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
