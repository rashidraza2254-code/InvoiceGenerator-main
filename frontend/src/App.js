import React, { useEffect, useState, useContext, createContext, useMemo } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import "@/App.css";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import Login from "@/pages/Login";
import POS from "@/pages/POS";
import MenuManagement from "@/pages/MenuManagement";
import BillHistory from "@/pages/BillHistory";
import Settings from "@/pages/Settings";
import BillView from "@/pages/BillView";
import Users from "@/pages/Users";
import Analytics from "@/pages/Analytics";
import Promos from "@/pages/Promos";
import Tables from "@/pages/Tables";
import Customers from "@/pages/Customers";
import KOT from "@/pages/KOT";
import RegisterRestaurant from "@/pages/RegisterRestaurant";
import Subscription from "@/pages/Subscription";
import PublicMenu from "@/pages/PublicMenu";
import Layout from "@/components/Layout";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

axios.defaults.withCredentials = true;

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export { formatApiErrorDetail };

function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = logged out, object = logged in
  useEffect(() => {
    let mounted = true;
    axios
      .get(`${API}/auth/me`)
      .then((res) => mounted && setUser(res.data))
      .catch(() => mounted && setUser(false));
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password });
    setUser(data);
    return data;
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
    } catch (err) {
      console.warn("Logout request failed", err);
    }
    setUser(false);
  };

  const value = useMemo(() => ({ user, setUser, login, logout }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === null) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FDFBF7]" data-testid="auth-loading">
        <div className="text-[#7A736E] font-medium">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (adminOnly && user.role !== "admin") {
    return (
      <Layout>
        <div className="p-12 text-center" data-testid="admin-only-warning">
          <div className="font-display text-2xl font-bold text-[#2A2421] mb-2">Admin access required</div>
          <p className="text-sm text-[#7A736E]">This page is only available to admins. Ask your admin for access.</p>
        </div>
      </Layout>
    );
  }
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<RegisterRestaurant />} />
          <Route path="/order/:restaurantId" element={<PublicMenu />} />
          <Route path="/order/:restaurantId/:tableId" element={<PublicMenu />} />
          {/* Protected routes */}
          <Route path="/" element={<ProtectedRoute><POS /></ProtectedRoute>} />
          <Route path="/menu" element={<ProtectedRoute adminOnly><MenuManagement /></ProtectedRoute>} />
          <Route path="/bills" element={<ProtectedRoute><BillHistory /></ProtectedRoute>} />
          <Route path="/bills/:id" element={<ProtectedRoute><BillView /></ProtectedRoute>} />
          <Route path="/bills/:id/kot" element={<ProtectedRoute><KOT /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute adminOnly><Analytics /></ProtectedRoute>} />
          <Route path="/promos" element={<ProtectedRoute adminOnly><Promos /></ProtectedRoute>} />
          <Route path="/tables" element={<ProtectedRoute><Tables /></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute adminOnly><Customers /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute adminOnly><Settings /></ProtectedRoute>} />
          <Route path="/subscription" element={<ProtectedRoute adminOnly><Subscription /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
