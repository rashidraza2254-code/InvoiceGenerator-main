import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API, useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Plus, Trash2, UserCircle } from "lucide-react";
import { toast } from "sonner";

const emptyForm = { email: "", password: "", name: "", role: "cashier" };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/users`);
      setUsers(res.data);
    } catch (_) {
      toast.error("Failed to load users");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!form.email || !form.password) {
      toast.error("Email and password required");
      return;
    }
    if (form.password.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/users`, form);
      toast.success("User created");
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/users/${id}`);
      toast.success("User deleted");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <div className="h-full overflow-y-auto scroll-soft">
      <div className="px-6 sm:px-8 py-6 max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#2A2421]">Users</h1>
            <p className="text-sm text-[#7A736E] mt-1">Manage cashiers and admins for your cafe.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl bg-[#C97A7E] hover:bg-[#B56A6D] text-white" data-testid="add-user-button">
                <Plus className="w-4 h-4 mr-2" /> Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-[#E8E4D9] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl text-[#2A2421]">New User</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="rounded-xl border-[#E8E4D9]"
                    data-testid="user-form-email"
                  />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="rounded-xl border-[#E8E4D9]"
                    data-testid="user-form-name"
                  />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="rounded-xl border-[#E8E4D9]"
                    data-testid="user-form-password"
                  />
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger className="rounded-xl border-[#E8E4D9]" data-testid="user-form-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cashier">Cashier</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl border-[#E8E4D9]">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={saving}
                  className="rounded-xl bg-[#C97A7E] hover:bg-[#B56A6D] text-white"
                  data-testid="user-form-save"
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="bg-white border-[#E8E4D9] rounded-2xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E8E4D9]">
                <TableHead className="text-xs uppercase tracking-wider text-[#7A736E]">User</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-[#7A736E]">Email</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-[#7A736E]">Role</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-[#7A736E]">Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-[#7A736E] py-12">
                    No users.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} className="border-[#E8E4D9]" data-testid={`user-row-${u.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserCircle className="w-5 h-5 text-[#7A736E]" />
                        <span className="font-medium text-[#2A2421]">{u.name || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          u.role === "admin" ? "bg-[#C97A7E]/15 text-[#C97A7E]" : "bg-[#6A7D64]/15 text-[#6A7D64]"
                        }
                      >
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-[#7A736E]">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {me?.id !== u.id && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50"
                              data-testid={`delete-user-${u.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-white border-[#E8E4D9] rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete user &quot;{u.email}&quot;?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(u.id)}
                                className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
                                data-testid={`confirm-delete-user-${u.id}`}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
