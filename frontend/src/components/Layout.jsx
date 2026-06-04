import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import {
  Coffee,
  ReceiptText,
  History,
  Settings as SettingsIcon,
  LogOut,
  ScrollText,
  Users as UsersIcon,
  BarChart3,
  Ticket,
  Sparkles,
  UtensilsCrossed,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ALL_NAV = [
  { to: "/", label: "POS", icon: ReceiptText, testid: "nav-pos", roles: ["admin", "cashier"] },
  { to: "/menu", label: "Menu", icon: Coffee, testid: "nav-menu", roles: ["admin"] },
  { to: "/bills", label: "Bills", icon: History, testid: "nav-bills", roles: ["admin", "cashier"] },
  { to: "/tables", label: "Tables", icon: UtensilsCrossed, testid: "nav-tables", roles: ["admin", "cashier"] },
  { to: "/analytics", label: "Analytics", icon: BarChart3, testid: "nav-analytics", roles: ["admin"] },
  { to: "/promos", label: "Promos", icon: Ticket, testid: "nav-promos", roles: ["admin"] },
  { to: "/customers", label: "Customers", icon: Sparkles, testid: "nav-customers", roles: ["admin"] },
  { to: "/users", label: "Users", icon: UsersIcon, testid: "nav-users", roles: ["admin"] },
  { to: "/settings", label: "Settings", icon: SettingsIcon, testid: "nav-settings", roles: ["admin"] },
  { to: "/subscription", label: "Plan", icon: CreditCard, testid: "nav-subscription", roles: ["admin"] },
];

export default function Layout({ children }) {
  const location = useLocation();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const role = user?.role || "cashier";
  const NAV = ALL_NAV.filter((i) => i.roles.includes(role));

  const handleLogout = async () => {
    await logout();
    nav("/login", { replace: true });
  };

  return (
    <div className="min-h-screen w-full flex bg-[#FDFBF7]">
      <aside
        className="hidden md:flex w-64 shrink-0 flex-col border-r border-[#E8E4D9] bg-white"
        data-testid="sidebar"
      >
        <div className="p-6 border-b border-[#E8E4D9]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C97A7E] flex items-center justify-center text-white">
              <ScrollText className="w-5 h-5" />
            </div>
            <div>
              <div className="font-display font-bold text-[#2A2421] text-lg leading-none">Brew &amp; Bean</div>
              <div className="text-xs text-[#7A736E] mt-1">Cafe POS</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const active = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                data-testid={item.testid}
                className={
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all " +
                  (active
                    ? "bg-[#F5F2EA] text-[#2A2421]"
                    : "text-[#7A736E] hover:bg-[#FDFBF7] hover:text-[#2A2421]")
                }
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-[#E8E4D9]">
          <div className="text-xs text-[#7A736E] mb-2 px-2">Signed in as</div>
          <div className="text-sm font-semibold text-[#2A2421] px-2 mb-1 truncate" data-testid="current-user-email">
            {user && user.email}
          </div>
          <div className="px-2 mb-3">
            <Badge
              variant="secondary"
              className={
                "text-xs font-semibold uppercase tracking-wide " +
                (role === "admin" ? "bg-[#C97A7E]/15 text-[#C97A7E]" : "bg-[#6A7D64]/15 text-[#6A7D64]")
              }
              data-testid="current-user-role"
            >
              {role}
            </Badge>
          </div>
          <Button
            variant="ghost"
            onClick={handleLogout}
            data-testid="logout-button"
            className="w-full justify-start gap-2 text-[#7A736E] hover:text-[#2A2421] hover:bg-[#F5F2EA]"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-white border-b border-[#E8E4D9] flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#C97A7E] flex items-center justify-center text-white">
            <ScrollText className="w-4 h-4" />
          </div>
          <span className="font-display font-bold text-[#2A2421]">Brew &amp; Bean</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="logout-button-mobile">
          <LogOut className="w-4 h-4" />
        </Button>
      </div>

      <main className="flex-1 md:pt-0 pt-14 pb-20 md:pb-0 overflow-hidden">{children}</main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E8E4D9] flex justify-around py-2">
        {NAV.map((item) => {
          const active = location.pathname === item.to || (item.to !== "/" && location.pathname.startsWith(item.to));
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              data-testid={`${item.testid}-mobile`}
              className={
                "flex flex-col items-center gap-1 px-3 py-1 text-xs font-medium " +
                (active ? "text-[#C97A7E]" : "text-[#7A736E]")
              }
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
