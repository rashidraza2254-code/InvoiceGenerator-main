import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Plus, Minus, X, MapPin, Store } from "lucide-react";
import { currencyToSymbol } from "@/lib/pdf";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PublicMenu() {
  const { restaurantId, tableId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState({}); // { itemId: qty }
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);

  useEffect(() => {
    let url = `${BACKEND_URL}/api/public/menu/${restaurantId}`;
    if (tableId) url += `?table_id=${tableId}`;
    axios.get(url)
      .then((r) => { setData(r.data); setLoading(false); })
      .catch(() => { setError("Menu not available"); setLoading(false); });
  }, [restaurantId, tableId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <div className="text-[#7A736E]">Loading menu…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🍽️</div>
          <div className="text-[#7A736E]">{error || "Menu not found"}</div>
        </div>
      </div>
    );
  }

  const { restaurant, table, categories } = data;
  const sym = currencyToSymbol(restaurant.currency);

  const addToCart = (id) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const removeFromCart = (id) => setCart((c) => {
    const next = { ...c };
    if ((next[id] || 0) <= 1) delete next[id];
    else next[id] -= 1;
    return next;
  });

  const cartItems = categories.flatMap((cat) => cat.items).filter((it) => cart[it.id] > 0);
  const cartTotal = cartItems.reduce((sum, it) => sum + it.price * (cart[it.id] || 0), 0);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const visibleCategories = activeCategory
    ? categories.filter((c) => c.name === activeCategory)
    : categories;

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-[#E8E4D9] shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display font-bold text-lg text-[#2A2421] leading-tight">{restaurant.name}</div>
              {restaurant.address && (
                <div className="flex items-center gap-1 text-xs text-[#7A736E] mt-0.5">
                  <MapPin className="w-3 h-3" /> {restaurant.address}
                </div>
              )}
              {table && (
                <Badge className="mt-1 bg-[#C97A7E]/15 text-[#C97A7E] text-xs font-medium">
                  Table: {table.name}
                </Badge>
              )}
            </div>
            {cartCount > 0 && (
              <Button
                onClick={() => setCartOpen(true)}
                className="relative rounded-xl bg-[#C97A7E] hover:bg-[#B56A6D] text-white"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                {cartCount} item{cartCount !== 1 ? "s" : ""}
                <span className="ml-2 font-bold">{sym}{cartTotal.toFixed(2)}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Category pills */}
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveCategory(null)}
            className={"px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors " +
              (!activeCategory ? "bg-[#2A2421] text-white" : "bg-[#E8E4D9] text-[#7A736E] hover:bg-[#D5CFB8]")}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(cat.name === activeCategory ? null : cat.name)}
              className={"px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors " +
                (activeCategory === cat.name ? "bg-[#2A2421] text-white" : "bg-[#E8E4D9] text-[#7A736E] hover:bg-[#D5CFB8]")}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu items */}
      <div className="max-w-2xl mx-auto px-4 py-4 pb-24 space-y-6">
        {visibleCategories.map((cat) => (
          <div key={cat.name}>
            <h2 className="font-display font-bold text-xl text-[#2A2421] mb-3">{cat.name}</h2>
            <div className="space-y-3">
              {cat.items.map((item) => (
                <Card key={item.id} className="bg-white border-[#E8E4D9] rounded-2xl overflow-hidden">
                  <div className="flex gap-3 p-3">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-20 h-20 rounded-xl object-cover shrink-0"
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[#2A2421]">{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-[#7A736E] mt-0.5 line-clamp-2">{item.description}</div>
                      )}
                      <div className="font-bold text-[#C97A7E] mt-1">{sym}{item.price.toFixed(2)}</div>
                    </div>
                    <div className="flex items-center shrink-0">
                      {cart[item.id] ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="w-8 h-8 rounded-full bg-[#E8E4D9] flex items-center justify-center hover:bg-[#D5CFB8] transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-[#2A2421] w-5 text-center">{cart[item.id]}</span>
                          <button
                            onClick={() => addToCart(item.id)}
                            className="w-8 h-8 rounded-full bg-[#C97A7E] flex items-center justify-center hover:bg-[#B56A6D] transition-colors"
                          >
                            <Plus className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item.id)}
                          className="w-8 h-8 rounded-full bg-[#C97A7E] flex items-center justify-center hover:bg-[#B56A6D] transition-colors"
                        >
                          <Plus className="w-3 h-3 text-white" />
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-2xl mx-auto bg-white rounded-t-3xl shadow-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-bold text-[#2A2421]">Your Order</h2>
              <button onClick={() => setCartOpen(false)} className="text-[#7A736E] hover:text-[#2A2421]">
                <X className="w-5 h-5" />
              </button>
            </div>
            {table && (
              <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-[#C97A7E]/10">
                <Store className="w-4 h-4 text-[#C97A7E]" />
                <span className="text-sm font-medium text-[#2A2421]">Table {table.name}</span>
              </div>
            )}
            <div className="space-y-3 mb-6">
              {cartItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-[#2A2421] text-sm">{item.name}</div>
                    <div className="text-xs text-[#7A736E]">{sym}{item.price.toFixed(2)} each</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 rounded-full bg-[#E8E4D9] flex items-center justify-center">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-bold w-5 text-center text-sm">{cart[item.id]}</span>
                    <button onClick={() => addToCart(item.id)} className="w-7 h-7 rounded-full bg-[#C97A7E] flex items-center justify-center">
                      <Plus className="w-3 h-3 text-white" />
                    </button>
                    <span className="font-bold text-[#2A2421] text-sm w-16 text-right">
                      {sym}{(item.price * (cart[item.id] || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-[#E8E4D9] pt-4 flex items-center justify-between mb-4">
              <span className="font-bold text-[#2A2421]">Total</span>
              <span className="font-bold text-xl text-[#C97A7E]">{sym}{cartTotal.toFixed(2)}</span>
            </div>
            <div className="rounded-xl bg-[#6A7D64]/10 border border-[#6A7D64]/20 p-4 text-center text-sm text-[#6A7D64]">
              <div className="font-semibold">Show this to your server</div>
              <div className="text-xs mt-1">Staff will process your order at the POS terminal</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
