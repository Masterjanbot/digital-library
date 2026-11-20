"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@/i18n/routing";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

type Profile = { username: string; email: string; first_name: string; last_name: string; preferred_language: string; role: string };

export function ProfileSettings() {
  const { authenticated } = useSession();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "" });
  const { data, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<Profile>("/auth/profile/")).data,
    enabled: authenticated,
  });
  useEffect(() => { if (!authenticated) router.replace("/login"); }, [authenticated, router]);
  if (!authenticated || isLoading || !data) return <p className="p-16 text-center">Loading settings...</p>;

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const values = new FormData(event.currentTarget);
      await api.patch("/auth/profile/", {
        email: values.get("email"),
        first_name: values.get("first_name"),
        last_name: values.get("last_name"),
      });
      setMessage("Profile saved.");
    } catch { setMessage("Profile could not be saved."); }
  }
  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await api.post("/auth/change-password/", passwords);
      setPasswords({ current_password: "", new_password: "" });
      setMessage("Password updated.");
    } catch { setMessage("Password could not be changed. Verify your current password and use at least 8 characters."); }
  }
  return <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
    <p className="eyebrow">ACCOUNT</p><h1 className="mt-2 text-3xl font-bold">Settings</h1>
    {message && <p role="status" className="mt-5 rounded-xl bg-brand-light p-3 text-sm text-brand-dark">{message}</p>}
    <form onSubmit={saveProfile} className="mt-7 space-y-4 rounded-2xl border bg-white p-6 shadow-card">
      <h2 className="text-lg font-semibold">Profile</h2><p className="text-sm text-slate-500">Signed in as {data.username} · {data.role}</p>
      <label className="form-label">Email<Field name="email" type="email" defaultValue={data.email} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="form-label">First name<Field name="first_name" defaultValue={data.first_name} /></label>
        <label className="form-label">Last name<Field name="last_name" defaultValue={data.last_name} /></label>
      </div>
      <Button>Save profile</Button>
    </form>
    <form onSubmit={changePassword} className="mt-5 space-y-4 rounded-2xl border bg-white p-6 shadow-card">
      <h2 className="text-lg font-semibold">Change password</h2>
      <label className="form-label">Current password<Field type="password" autoComplete="current-password" value={passwords.current_password} onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })} required /></label>
      <label className="form-label">New password<Field type="password" autoComplete="new-password" minLength={8} value={passwords.new_password} onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })} required /><span className="text-xs font-normal text-slate-500">Use at least 8 characters.</span></label>
      <Button>Update password</Button>
    </form>
  </div>;
}
