import React from "react";
import { Plus, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { currencyToSymbol } from "@/lib/pdf";

export default function MenuItemCard({ item, currency, pulse, onAdd, cartQty = 0 }) {
  const c = currencyToSymbol(currency);
  const tracked = item.stock !== null && item.stock !== undefined;
  const remaining = tracked ? item.stock - cartQty : Infinity;
  const isOut = tracked && remaining <= 0;
  const isLow = tracked && !isOut && remaining <= (item.low_stock_threshold ?? 5);

  return (
    <button
      onClick={() => !isOut && onAdd(item)}
      disabled={isOut}
      data-testid={`menu-item-${item.id}`}
      className={
        "menu-card relative group text-left bg-white rounded-2xl border border-[#E8E4D9] overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#C97A7E] " +
        (isOut
          ? "opacity-50 cursor-not-allowed"
          : "hover:border-[#C97A7E] ") +
        (pulse ? "cart-pulse" : "")
      }
    >
      <div className="aspect-square bg-[#F5F2EA] overflow-hidden relative">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className={
              "w-full h-full object-cover transition-transform duration-300 " +
              (isOut ? "" : "group-hover:scale-105")
            }
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#C97A7E] text-3xl font-display font-bold">
            {item.name[0]}
          </div>
        )}
        {(isOut || isLow) && (
          <Badge
            variant="secondary"
            className={
              "absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wide " +
              (isOut ? "bg-red-600 text-white" : "bg-amber-500 text-white")
            }
            data-testid={`stock-tag-${item.id}`}
          >
            {isOut ? (
              <>
                <Ban className="w-3 h-3 mr-1" /> Sold out
              </>
            ) : (
              <>Only {remaining} left</>
            )}
          </Badge>
        )}
      </div>
      <div className="p-3">
        <div className="text-xs uppercase tracking-wider text-[#7A736E] mb-1">{item.category}</div>
        <div className="font-semibold text-[#2A2421] text-sm leading-tight">{item.name}</div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-bold text-[#2A2421]">
            {c}
            {item.price.toFixed(2)}
          </span>
          <span
            className={
              "w-7 h-7 rounded-full flex items-center justify-center transition-colors " +
              (isOut
                ? "bg-[#F5F2EA] text-[#7A736E]"
                : "bg-[#F5F2EA] group-hover:bg-[#C97A7E] group-hover:text-white text-[#C97A7E]")
            }
          >
            <Plus className="w-4 h-4" />
          </span>
        </div>
      </div>
    </button>
  );
}
