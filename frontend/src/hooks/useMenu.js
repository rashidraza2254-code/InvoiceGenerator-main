import { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import { API } from "@/App";
import { toast } from "sonner";

export default function useMenu() {
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/menu`);
      setMenu(res.data);
    } catch (e) {
      toast.error("Failed to load menu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set(menu.map((m) => m.category));
    return ["all", ...Array.from(set).sort()];
  }, [menu]);

  const filterMenu = useCallback(
    (activeCategory, search) =>
      menu.filter((m) => {
        const matchCat = activeCategory === "all" || m.category === activeCategory;
        const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase());
        return matchCat && matchSearch;
      }),
    [menu]
  );

  return { menu, categories, filterMenu, loading, reload: load };
}
