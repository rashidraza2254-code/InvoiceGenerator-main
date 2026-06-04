import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Package } from "lucide-react";

export default function MenuItemRow({ item, onEdit, onDelete }) {
  const tracked = item.stock !== null && item.stock !== undefined;
  const low = tracked && item.stock <= (item.low_stock_threshold ?? 5);
  const out = tracked && item.stock === 0;
  let stockBadge = null;
  if (tracked) {
    if (out) {
      stockBadge = (
        <Badge variant="secondary" className="bg-red-100 text-red-700" data-testid={`stock-badge-${item.id}`}>
          <Package className="w-3 h-3 mr-1" /> Out of stock
        </Badge>
      );
    } else if (low) {
      stockBadge = (
        <Badge variant="secondary" className="bg-amber-100 text-amber-700" data-testid={`stock-badge-${item.id}`}>
          <Package className="w-3 h-3 mr-1" /> Low · {item.stock}
        </Badge>
      );
    } else {
      stockBadge = (
        <Badge variant="secondary" className="bg-[#6A7D64]/15 text-[#6A7D64]" data-testid={`stock-badge-${item.id}`}>
          <Package className="w-3 h-3 mr-1" /> {item.stock} in stock
        </Badge>
      );
    }
  }

  return (
    <Card
      className="bg-white border-[#E8E4D9] rounded-2xl p-4 flex gap-3 items-center"
      data-testid={`menu-row-${item.id}`}
    >
      <div className="w-16 h-16 rounded-xl bg-[#F5F2EA] overflow-hidden shrink-0">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#C97A7E] font-display font-bold text-xl">
            {item.name[0]}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[#2A2421] truncate">{item.name}</div>
        <div className="text-xs text-[#7A736E] truncate">{item.description || "—"}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="font-bold text-[#2A2421]">₹{item.price.toFixed(2)}</span>
          {stockBadge}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => onEdit(item)} data-testid={`edit-${item.id}`}>
          <Pencil className="w-4 h-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="w-8 h-8 text-red-600 hover:bg-red-50"
              data-testid={`delete-${item.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-white border-[#E8E4D9] rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &quot;{item.name}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(item.id)}
                className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
                data-testid={`confirm-delete-${item.id}`}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
}
