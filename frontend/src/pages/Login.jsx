import React, { useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth, formatApiErrorDetail } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Coffee } from "lucide-react";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@cafe.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user && user !== null) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      nav("/", { replace: true });
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 sm:p-8">
      <div
        className="absolute inset-0 bg-gradient-to-br from-[#6A7D64] via-[#4A3F38] to-[#2A2421]"
        aria-hidden
      />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 mb-4">
            <Coffee className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-white tracking-tight">Brew &amp; Bean</h1>
          <p className="text-white/70 mt-2 text-sm">Cafe Bill Generator — Cashier Login</p>
        </div>

        <Card className="border-white/20 bg-white/95 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="font-display text-2xl text-[#2A2421]">Welcome back</CardTitle>
            <CardDescription className="text-[#7A736E]">Sign in to start taking orders.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" data-testid="login-form">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#2A2421]">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="login-email-input"
                  className="rounded-xl border-[#E8E4D9] focus-visible:ring-[#C97A7E]"
                  placeholder="admin@cafe.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[#2A2421]">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="login-password-input"
                  className="rounded-xl border-[#E8E4D9] focus-visible:ring-[#C97A7E]"
                  placeholder="••••••••"
                />
              </div>
              {error && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" data-testid="login-error">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                disabled={loading}
                data-testid="login-submit-button"
                className="w-full rounded-xl h-11 bg-[#C97A7E] hover:bg-[#B56A6D] text-white font-semibold transition-all hover:-translate-y-0.5"
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
              <p className="text-xs text-[#7A736E] text-center pt-1">
                Default admin: <span className="font-semibold">admin@cafe.com</span> / <span className="font-semibold">admin123</span>
              </p>
              <div className="border-t border-[#E8E4D9] pt-3 text-center">
                <p className="text-sm text-[#7A736E]">
                  New restaurant?{" "}
                  <Link to="/register" className="text-[#C97A7E] font-semibold hover:underline">Register for free</Link>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
