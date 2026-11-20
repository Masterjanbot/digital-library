"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import { useSession } from "@/hooks/use-session";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

type Resource = "categories" | "authors" | "publishers" | "subscriptions";
type RecordItem = { id: number; name?: string; description?: string; biography?: string; birth_date?: string | null; website?: string | null; user?: number; username?: string; plan?: string; status?: string; expires_at?: string | null };
type Profile = { role: string; is_superuser: boolean };

const resourceFields: Record<Exclude<Resource, "subscriptions">, string[]> = {
  categories: ["name", "description"],
  authors: ["name", "biography", "birth_date"],
  publishers: ["name", "website", "description"],
};

export function AdminResourceManager({ resource }: { resource: Resource }) {
  const t = useTranslations("admin");
  const common = useTranslations("common");
  const { authenticated } = useSession();
  const router = useRouter();
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<Profile>("/auth/profile/")).data,
    enabled: authenticated,
  });
  const rows = useQuery({
    queryKey: ["admin-resource", resource],
    queryFn: async () => (await api.get<Paginated<RecordItem>>(`/${resource}/`, { params: { page_size: 100 } })).data.results,
    enabled: authenticated && profile.isSuccess,
  });
  const isAdmin = Boolean(profile.data?.is_superuser || profile.data?.role === "admin");
  const canManageCatalog = isAdmin || ["librarian", "editor"].includes(profile.data?.role || "");
  const canAccess = resource === "subscriptions" ? isAdmin : canManageCatalog;

  useEffect(() => {
    if (!authenticated) router.replace("/login");
  }, [authenticated, router]);

  async function save(event: React.FormEvent<HTMLFormElement>, id?: number) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    try {
      if (resource === "subscriptions") {
        const values = {
          user: Number(form.get("user")),
          plan: String(form.get("plan")),
          status: String(form.get("status")),
          expires_at: String(form.get("expires_at") || "") || null,
        };
        if (id) await api.patch(`/subscriptions/${id}/`, values);
        else await api.post("/subscriptions/", values);
      } else {
        const values = Object.fromEntries(resourceFields[resource].map((field) => [field, String(form.get(field) || "") || null]));
        if (id) await api.patch(`/${resource}/${id}/`, values);
        else await api.post(`/${resource}/`, values);
      }
      setEditing(null);
      setMessage(t("saved"));
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin-resource", resource] }),
        client.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      if (!id) formElement.reset();
    } catch {
      setMessage(t("saveError"));
    }
  }

  async function remove(row: RecordItem) {
    if (!window.confirm(t("confirmDelete"))) return;
    try {
      await api.delete(`/${resource}/${row.id}/`);
      setMessage(t("deleted"));
      await client.invalidateQueries({ queryKey: ["admin-resource", resource] });
    } catch {
      setMessage(t("deleteError"));
    }
  }

  if (!authenticated) return null;
  if (profile.isLoading) return <p className="p-16 text-center text-slate-500">{common("loading")}</p>;
  if (profile.isError || !canAccess) return <div role="alert" className="mx-auto max-w-2xl px-4 py-16 text-center">
    <h1 className="text-2xl font-semibold">{t("accessDeniedTitle")}</h1>
    <p className="mt-3 text-slate-600">{t("accessDenied")}</p>
  </div>;

  const heading = t(resource);
  return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
    <p className="eyebrow">{t("management")}</p><h1 className="mt-2 text-3xl font-semibold">{heading}</h1>
    {message && <p role="status" className="mt-5 rounded-xl bg-brand-light p-3 text-sm text-brand-dark">{message}</p>}
    {resource === "subscriptions" ? <form onSubmit={(event) => save(event)} className="dashboard-panel mt-6 grid gap-3 sm:grid-cols-2">
      <label className="form-label">{t("userId")}<Field name="user" type="number" min={1} required /></label>
      <label className="form-label">{t("plan")}<select name="plan" className="form-control"><option value="free">{t("free")}</option><option value="premium">{t("premium")}</option></select></label>
      <label className="form-label">{t("status")}<select name="status" className="form-control"><option value="active">{t("active")}</option><option value="cancelled">{t("cancelled")}</option><option value="expired">{t("expired")}</option></select></label>
      <label className="form-label">{t("expiresAt")}<Field name="expires_at" type="datetime-local" /></label>
      <Button type="submit" className="sm:col-span-2">{t("createSubscription")}</Button>
    </form> : <form onSubmit={(event) => save(event)} className="dashboard-panel mt-6 grid gap-3 sm:grid-cols-2">
      <label className="form-label">{t("name")}<Field name="name" required maxLength={200} /></label>
      {resource === "authors" && <label className="form-label">{t("birthDate")}<Field name="birth_date" type="date" /></label>}
      {resource === "publishers" && <label className="form-label">{t("website")}<Field name="website" type="url" /></label>}
      <label className="form-label sm:col-span-2">{resource === "authors" ? t("biography") : t("description")}<textarea name={resource === "authors" ? "biography" : "description"} rows={3} className="form-control" /></label>
      <Button type="submit" className="sm:col-span-2">{t("create")}</Button>
    </form>}
    {rows.isError && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{t("loadError")}</p>}
    {rows.isLoading ? <p className="py-8 text-slate-500">{common("loading")}</p> : <div className="mt-6 space-y-3">
      {rows.data?.map((row) => <article key={row.id} className="dashboard-panel">
        {editing === row.id ? <form onSubmit={(event) => save(event, row.id)} className="grid gap-3 sm:grid-cols-2">
          {resource === "subscriptions" ? <>
            <label className="form-label">{t("userId")}<Field name="user" type="number" min={1} required defaultValue={row.user} /></label>
            <label className="form-label">{t("plan")}<select name="plan" defaultValue={row.plan} className="form-control"><option value="free">{t("free")}</option><option value="premium">{t("premium")}</option></select></label>
            <label className="form-label">{t("status")}<select name="status" defaultValue={row.status} className="form-control"><option value="active">{t("active")}</option><option value="cancelled">{t("cancelled")}</option><option value="expired">{t("expired")}</option></select></label>
            <label className="form-label">{t("expiresAt")}<Field name="expires_at" type="datetime-local" defaultValue={row.expires_at?.slice(0, 16) || ""} /></label>
          </> : resourceFields[resource].map((field) => <label key={field} className="form-label">{t(field)}{field === "description" || field === "biography" ? <textarea name={field} defaultValue={String(row[field as keyof RecordItem] || "")} rows={3} className="form-control" /> : <Field name={field} type={field === "birth_date" ? "date" : field === "website" ? "url" : "text"} defaultValue={String(row[field as keyof RecordItem] || "")} required={field === "name"} />}</label>)}
          <div className="flex gap-2 sm:col-span-2"><Button type="submit">{t("save")}</Button><Button type="button" variant="secondary" onClick={() => setEditing(null)}>{common("cancel")}</Button></div>
        </form> : <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">{row.name || `${t("subscription")} #${row.id}`}</h2><p className="mt-1 text-sm text-slate-500">{resource === "subscriptions" ? `${t("userId")}: ${row.user} · ${row.plan} · ${row.status}` : row.description || row.biography || row.website || row.birth_date}</p></div>
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(row.id)}>{t("edit")}</Button><Button type="button" variant="danger" onClick={() => void remove(row)}>{t("delete")}</Button></div>
        </div>}
      </article>)}
      {!rows.data?.length && <p className="empty-panel">{t("empty")}</p>}
    </div>}
  </div>;
}
