import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";

export default function useCart() {
  const [cart, setCart] = useState([]);
  const [pulseId, setPulseId] = useState(null);

  const addToCart = useCallback((item) => {
    const tracked = item.stock !== null && item.stock !== undefined;
    let blocked = false;
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      const wanted = (existing ? existing.quantity : 0) + 1;
      if (tracked && wanted > item.stock) {
        blocked = true;
        return prev;
      }
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        { menu_item_id: item.id, name: item.name, price: item.price, quantity: 1, discount: 0, stock: tracked ? item.stock : null },
      ];
    });
    if (blocked) {
      toast.error(`Only ${item.stock} ${item.name} in stock`);
      return;
    }
    setPulseId(item.id);
    setTimeout(() => setPulseId(null), 220);
  }, []);

  const inc = useCallback((id) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.menu_item_id !== id) return c;
        if (c.stock !== null && c.stock !== undefined && c.quantity + 1 > c.stock) {
          toast.error(`Only ${c.stock} ${c.name} in stock`);
          return c;
        }
        return { ...c, quantity: c.quantity + 1 };
      })
    );
  }, []);

  const dec = useCallback((id) => {
    setCart((prev) =>
      prev
        .map((c) => (c.menu_item_id === id ? { ...c, quantity: c.quantity - 1 } : c))
        .filter((c) => c.quantity > 0)
    );
  }, []);

  const removeItem = useCallback((id) => {
    setCart((prev) => prev.filter((c) => c.menu_item_id !== id));
  }, []);

  const setItemDiscount = useCallback((id, discount) => {
    setCart((prev) =>
      prev.map((c) =>
        c.menu_item_id === id ? { ...c, discount: Math.max(0, Number(discount) || 0) } : c
      )
    );
  }, []);

  const clear = useCallback(() => setCart([]), []);

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (s, c) => s + Math.max(0, c.price * c.quantity - (Number(c.discount) || 0)),
        0
      ),
    [cart]
  );

  const cartQtyByItem = useMemo(() => {
    const map = {};
    cart.forEach((c) => {
      map[c.menu_item_id] = c.quantity;
    });
    return map;
  }, [cart]);

  return { cart, pulseId, addToCart, inc, dec, removeItem, setItemDiscount, clear, subtotal, cartQtyByItem };
}
