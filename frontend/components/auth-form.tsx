"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { Link } from "@/i18n/routing";
import { api, saveTokens } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useState } from "react";

const loginSchema = z.object({
  username: z.string().min(1), password: z.string().min(1),
});
const registerSchema = z.object({
  username: z.string().min(3), email: z.string().email(), password: z.string().min(8),
  password_confirm: z.string().min(1),
  first_name: z.string().max(150), last_name: z.string().max(150),
}).refine((values) => values.password === values.password_confirm, {
  path: ["password_confirm"],
});

function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState("");
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const submit = handleSubmit(async (values) => {
    setError("");
    try {
      const { data } = await api.post<{ access: string; refresh: string }>("/auth/login/", values);
      saveTokens(data.access, data.refresh);
      router.push("/");
    } catch {
      setError(t("invalid"));
    }
  });
  return <form onSubmit={submit} className="space-y-4">
    <label className="form-label">{t("username")}<Field autoComplete="username" {...register("username")} /></label>
    <label className="form-label">{t("password")}<Field type="password" autoComplete="current-password" {...register("password")} /></label>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Button className="w-full" disabled={isSubmitting}>{isSubmitting ? "..." : t("submitLogin")}</Button>
    <Link className="block text-center text-sm text-brand hover:underline" href="/forgot-password">{t("forgotPassword")}</Link>
  </form>;
}

function RegisterForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState("");
  const { register, handleSubmit, formState: { isSubmitting, errors: formErrors } } = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) });
  const submit = handleSubmit(async (values) => {
    setError("");
    const registration = {
      username: values.username,
      email: values.email,
      password: values.password,
      first_name: values.first_name,
      last_name: values.last_name,
    };
    try {
      await api.post("/auth/register/", registration);
      const { data } = await api.post<{ access: string; refresh: string }>("/auth/login/", { username: values.username, password: values.password });
      saveTokens(data.access, data.refresh);
      router.push("/");
    } catch {
      setError(t("invalid"));
    }
  });
  return <form onSubmit={submit} className="space-y-4">
    <label className="form-label">{t("username")}<Field autoComplete="username" {...register("username")} /></label>
    <label className="form-label">{t("email")}<Field type="email" autoComplete="email" {...register("email")} /></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="form-label">{t("firstName")}<Field {...register("first_name")} /></label>
      <label className="form-label">{t("lastName")}<Field {...register("last_name")} /></label>
    </div>
    <label className="form-label">{t("password")}<Field type="password" autoComplete="new-password" minLength={8} {...register("password")} /><span className="text-xs font-normal text-slate-500">{t("passwordMinimumHint")}</span></label>
    <label className="form-label">{t("confirmPassword")}<Field type="password" autoComplete="new-password" required aria-invalid={Boolean(formErrors.password_confirm)} {...register("password_confirm")} /></label>
    {formErrors.password_confirm && <p role="alert" className="text-sm text-red-700">{t("passwordMismatch")}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Button className="w-full" disabled={isSubmitting}>{isSubmitting ? "..." : t("submitRegister")}</Button>
  </form>;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const t = useTranslations("auth");
  return <div className="mx-auto max-w-md px-4 py-16">
    <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-card sm:p-9">
      <p className="eyebrow">PAPERTRAIL ACCOUNT</p>
      <h1 className="mb-7 mt-2 text-3xl font-bold">{mode === "login" ? t("loginTitle") : t("registerTitle")}</h1>
      {mode === "login" ? <LoginForm /> : <RegisterForm />}
    </div>
  </div>;
}
