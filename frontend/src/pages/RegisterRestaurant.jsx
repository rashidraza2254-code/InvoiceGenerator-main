import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Store, ArrowLeft } from "lucide-react";

export default function RegisterRestaurant() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [form, setForm] = useState({
    restaurant_name: "",
    owner_name: "",
    owner_email: "",
    password: "",
    confirm_password: "",
  });
  const [loading, setLoading] = useState(false);

  const f = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.restaurant_name.trim()) { toast.error("Restaurant name required"); return; }
    if (!form.owner_email.trim()) { toast.error("Email required"); return; }
    if (form.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (form.password !== form.confirm_password) { toast.error("Passwords do not match"); return; }

    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/auth/register-restaurant`, {
        restaurant_name: form.restaurant_name.trim(),
        owner_name: form.owner_name.trim() || undefined,
        owner_email: form.owner_email.trim(),
        password: form.password,
      });
      setUser(data);
      toast.success(`Welcome to ${form.restaurant_name}! Your account is ready.`);
      navigate("/");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#C97A7E]/15 mb-4">
            <Store className="w-8 h-8 text-[#C97A7E]" />
          </div>
          <h1 className="font-display text-3xl font-bold text-[#2A2421]">Register your Restaurant</h1>
          <p className="text-sm text-[#7A736E] mt-2">Free to start. No credit card required.</p>
        </div>

        <Card className="bg-white border-[#E8E4D9] rounded-2xl p-6">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Restaurant / Cafe Name *</Label>
              <Input
                value={form.restaurant_name}
                onChange={f("restaurant_name")}
                placeholder="Brew & Bean Cafe"
                className="rounded-xl border-[#E8E4D9]"
                data-testid="reg-restaurant-name"
                required
              />
            </div>
            <div>
              <Label>Your Name</Label>
              <Input
                value={form.owner_name}
                onChange={f("owner_name")}
                placeholder="Rahul Sharma"
                className="rounded-xl border-[#E8E4D9]"
                data-testid="reg-owner-name"
              />
            </div>
            <div>
              <Label>Email Address *</Label>
              <Input
                type="email"
                value={form.owner_email}
                onChange={f("owner_email")}
                placeholder="you@yourcafe.com"
                className="rounded-xl border-[#E8E4D9]"
                data-testid="reg-email"
                required
              />
            </div>
            <div>
              <Label>Password *</Label>
              <Input
                type="password"
                value={form.password}
                onChange={f("password")}
                placeholder="Min 6 characters"
                className="rounded-xl border-[#E8E4D9]"
                data-testid="reg-password"
                required
              />
            </div>
            <div>
              <Label>Confirm Password *</Label>
              <Input
                type="password"
                value={form.confirm_password}
                onChange={f("confirm_password")}
                placeholder="Repeat password"
                className="rounded-xl border-[#E8E4D9]"
                data-testid="reg-confirm-password"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#C97A7E] hover:bg-[#B56A6D] text-white mt-2"
              data-testid="reg-submit"
            >
              {loading ? "Creating account…" : "Create Restaurant Account"}
            </Button>
          </form>
        </Card>

        {/* Plans teaser */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          {[
            { name: "Free", price: "₹0", detail: "100 bills/mo" },
            { name: "Starter", price: "₹999", detail: "500 bills/mo" },
            { name: "Pro", price: "₹2,999", detail: "Unlimited" },
          ].map((p) => (
            <div key={p.name} className="rounded-xl border border-[#E8E4D9] bg-white p-3">
              <div className="font-semibold text-sm text-[#2A2421]">{p.name}</div>
              <div className="text-xs font-bold text-[#C97A7E] mt-0.5">{p.price}<span className="text-[#7A736E] font-normal">/mo</span></div>
              <div className="text-xs text-[#7A736E] mt-0.5">{p.detail}</div>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-[#7A736E] mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-[#C97A7E] font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
