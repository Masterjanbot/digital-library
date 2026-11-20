"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function PasswordResetRequest() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/auth/password-reset/", { email });
      setMessage(t("resetMessage"));
    } catch { setError(t("invalid")); }
  }
  return <section className="mx-auto max-w-md px-4 py-16"><form onSubmit={submit} className="space-y-4 rounded-3xl border bg-white p-8 shadow-card">
    <h1 className="text-2xl font-bold">{t("forgotPassword")}</h1>
    <label className="form-label">{t("email")}<Field type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    {message && <p role="status" className="rounded-lg bg-brand-light p-3 text-sm text-brand-dark">{message}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Button>{t("sendReset")}</Button>
  </form></section>;
}

export function PasswordResetConfirm({ uid, token }: { uid: string; token: string }) {
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/auth/password-reset/confirm/", { uid, token, new_password: password });
      setMessage(t("resetSuccess"));
    } catch { setError(t("invalid")); }
  }
  return <section className="mx-auto max-w-md px-4 py-16"><form onSubmit={submit} className="space-y-4 rounded-3xl border bg-white p-8 shadow-card">
    <h1 className="text-2xl font-bold">{t("resetTitle")}</h1>
    <label className="form-label">{t("newPassword")}<Field type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /><span className="text-xs font-normal text-slate-500">{t("passwordMinimumHint")}</span></label>
    {message && <p role="status" className="rounded-lg bg-brand-light p-3 text-sm text-brand-dark">{message}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Button>{t("resetTitle")}</Button>
  </form></section>;
}
