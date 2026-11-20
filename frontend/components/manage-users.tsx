"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useRouter } from "@/i18n/routing";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { Paginated } from "@/lib/types";

type UserRole = "admin" | "librarian" | "editor" | "premium" | "user";
type ManagedUser = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  is_superuser: boolean;
};
type Profile = { id: number; role: string; is_superuser: boolean };
type UserFilters = { search: string; role: string; active: string; page: number };

const PAGE_SIZE = 10;

function validationMessages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(validationMessages);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(validationMessages);
  }
  return [];
}

function apiError(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const messages = validationMessages(error.response?.data);
  return messages.length ? messages.join(" ") : fallback;
}

export function ManageUsers() {
  const t = useTranslations("admin");
  const common = useTranslations("common");
  const router = useRouter();
  const { authenticated } = useSession();
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [filters, setFilters] = useState<UserFilters>({ search: "", role: "", active: "", page: 1 });
  const [createPending, setCreatePending] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["users", filters],
    queryFn: async () => (await api.get<Paginated<ManagedUser>>("/users/", {
      params: {
        search: filters.search || undefined,
        role: filters.role || undefined,
        is_active: filters.active || undefined,
        page: filters.page,
        page_size: PAGE_SIZE,
      },
    })).data,
    enabled: authenticated,
  });
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await api.get<Profile>("/auth/profile/")).data,
    enabled: authenticated,
  });
  const canManageUsers = Boolean(profileQuery.data?.is_superuser || profileQuery.data?.role === "admin");
  const pageCount = Math.max(1, Math.ceil((data?.count || 0) / PAGE_SIZE));
  useEffect(() => { if (!authenticated) router.replace("/login"); }, [authenticated, router]);

  function showMessage(nextMessage: string, isError = false) {
    setMessage(nextMessage);
    setMessageIsError(isError);
  }

  function updateFilters(changes: Partial<Omit<UserFilters, "page">>) {
    setFilters((current) => ({ ...current, ...changes, page: 1 }));
  }

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createPending) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (form.get("password") !== form.get("password_confirm")) {
      showMessage(t("passwordMismatch"), true);
      return;
    }
    setCreatePending(true);
    showMessage("");
    try {
      await api.post("/users/", Object.fromEntries(form.entries()));
      showMessage(t("accountCreated"));
      formElement.reset();
      updateFilters({ search: "", role: "", active: "" });
      await client.invalidateQueries({ queryKey: ["users"] });
    } catch (error) {
      showMessage(apiError(error, t("accountCreateError")), true);
    } finally {
      setCreatePending(false);
    }
  }

  async function saveUser(event: React.FormEvent<HTMLFormElement>, user: ManagedUser) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPendingAction(`save-${user.id}`);
    showMessage("");
    try {
      await api.patch(`/users/${user.id}/`, {
        username: form.get("username"),
        email: form.get("email"),
        first_name: form.get("first_name"),
        last_name: form.get("last_name"),
        role: form.get("role"),
        is_active: form.get("is_active") === "on",
      });
      showMessage(t("accountUpdated", { username: String(form.get("username")) }));
      await client.invalidateQueries({ queryKey: ["users"] });
    } catch (error) {
      showMessage(apiError(error, t("accountUpdateError")), true);
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteUser(user: ManagedUser) {
    if (!window.confirm(t("confirmDeleteUser", { username: user.username }))) return;
    setPendingAction(`delete-${user.id}`);
    showMessage("");
    try {
      await api.delete(`/users/${user.id}/`);
      showMessage(t("accountDeleted", { username: user.username }));
      if (data?.results.length === 1 && filters.page > 1) {
        setFilters((current) => ({ ...current, page: current.page - 1 }));
      }
      await client.invalidateQueries({ queryKey: ["users"] });
    } catch (error) {
      showMessage(apiError(error, t("accountDeleteError")), true);
    } finally {
      setPendingAction(null);
    }
  }

  if (!authenticated) return null;
  if (profileQuery.isLoading) return <p className="p-16 text-center text-slate-500">{common("loading")}</p>;
  if (profileQuery.isError) return <p role="alert" className="p-16 text-center text-red-700">{t("loadUsersError")}</p>;
  if (!canManageUsers) return <div role="alert" className="mx-auto max-w-2xl px-4 py-16 text-center"><h1 className="text-2xl font-semibold">{t("accessDeniedTitle")}</h1><p className="mt-3 text-slate-600">{t("accessDenied")}</p></div>;

  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <header>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{t("users")}</h1>
      <p className="mt-2 text-sm text-slate-500">{t("usersDescription")}</p>
    </header>

    <form onSubmit={createUser} className="dashboard-panel mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="sm:col-span-2 lg:col-span-3">
        <h2 className="text-lg font-semibold">{t("createAccount")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("createUserHint")}</p>
      </div>
      <label className="form-label">{t("username")}<Field name="username" autoComplete="off" required minLength={3} maxLength={150} /></label>
      <label className="form-label">{t("email")}<Field name="email" type="email" autoComplete="off" required /></label>
      <label className="form-label">{t("firstName")}<Field name="first_name" maxLength={150} /></label>
      <label className="form-label">{t("lastName")}<Field name="last_name" maxLength={150} /></label>
      <label className="form-label">{t("password")}<Field name="password" type="password" autoComplete="new-password" required minLength={8} /><span className="text-xs font-normal text-slate-500">{t("passwordMinimumHint")}</span></label>
      <label className="form-label">{t("confirmPassword")}<Field name="password_confirm" type="password" autoComplete="new-password" required minLength={8} /></label>
      <label className="form-label">{t("role")}<select name="role" defaultValue="user" className="form-control">
        <option value="user">{t("normalUser")}</option><option value="premium">{t("premiumUser")}</option><option value="editor">{t("editorRole")}</option><option value="librarian">{t("librarianRole")}</option><option value="admin">{t("administratorRole")}</option>
      </select></label>
      <div className="flex items-end sm:col-span-2 lg:col-span-2">
        <Button type="submit" className="w-full sm:w-auto" disabled={createPending}>{createPending ? t("creatingAccount") : t("createAccount")}</Button>
      </div>
    </form>

    {message && <p role={messageIsError ? "alert" : "status"} className={`mt-4 rounded-lg p-3 text-sm ${messageIsError ? "bg-red-50 text-red-700" : "bg-brand-light text-brand-dark"}`}>{message}</p>}

    <section className="mt-8" aria-labelledby="users-list-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="users-list-heading" className="text-xl font-semibold">{t("userList")}</h2>
          <p className="mt-1 text-sm text-slate-500">{data?.count ?? 0} · {t("page")} {filters.page} / {pageCount}</p>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] lg:w-auto">
          <Field placeholder={t("searchUsers")} aria-label={t("searchUsers")} value={filters.search} onChange={(event) => updateFilters({ search: event.target.value })} />
          <select aria-label={t("filterByRole")} value={filters.role} onChange={(event) => updateFilters({ role: event.target.value })} className="form-control sm:min-w-40">
            <option value="">{t("allRoles")}</option><option value="admin">{t("administratorRole")}</option><option value="librarian">{t("librarianRole")}</option><option value="editor">{t("editorRole")}</option><option value="premium">{t("premiumUser")}</option><option value="user">{t("normalUser")}</option>
          </select>
          <select aria-label={t("filterByStatus")} value={filters.active} onChange={(event) => updateFilters({ active: event.target.value })} className="form-control sm:min-w-40">
            <option value="">{t("allStatuses")}</option><option value="true">{t("active")}</option><option value="false">{t("inactive")}</option>
          </select>
        </div>
      </div>

      {isError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{t("loadUsersError")}</p>}
      {isLoading ? <div className="loading-skeleton h-64" aria-label={common("loading")} /> : !isError && !data?.results.length
        ? <p className="empty-panel">{filters.search || filters.role || filters.active ? t("noUsersMatch") : t("noUsers")}</p>
        : !isError && <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="hidden">
            {data?.results.map((user) => <form key={user.id} id={`user-form-${user.id}`} onSubmit={(event) => saveUser(event, user)} />)}
          </div>
          <table className="w-full min-w-[850px] border-collapse text-start text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3 text-start">{t("user")}</th><th className="px-4 py-3 text-start">{t("email")}</th><th className="px-4 py-3 text-start">{t("role")}</th><th className="px-4 py-3 text-start">{t("status")}</th><th className="px-4 py-3 text-start">{t("actions")}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.results.map((user) => {
                const formId = `user-form-${user.id}`;
                const protectedAccount = user.is_superuser && !profileQuery.data?.is_superuser;
                return <tr key={user.id} className="align-top">
                <td className="min-w-52 px-4 py-3">
                  <Field form={formId} name="username" aria-label={t("username")} defaultValue={user.username} required minLength={3} maxLength={150} disabled={protectedAccount} />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Field form={formId} name="first_name" aria-label={t("firstName")} placeholder={t("firstName")} defaultValue={user.first_name} maxLength={150} disabled={protectedAccount} />
                    <Field form={formId} name="last_name" aria-label={t("lastName")} placeholder={t("lastName")} defaultValue={user.last_name} maxLength={150} disabled={protectedAccount} />
                  </div>
                </td>
                <td className="min-w-52 px-4 py-3"><Field form={formId} name="email" aria-label={t("email")} type="email" defaultValue={user.email} required disabled={protectedAccount} /></td>
                <td className="min-w-44 px-4 py-3">
                  <select form={formId} name="role" aria-label={t("role")} defaultValue={user.role} className="form-control" disabled={protectedAccount}>
                    <option value="user">{t("normalUser")}</option><option value="premium">{t("premiumUser")}</option><option value="editor">{t("editorRole")}</option><option value="librarian">{t("librarianRole")}</option><option value="admin">{t("administratorRole")}</option>
                  </select>
                </td>
                <td className="min-w-28 px-4 py-3">
                  <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                    <input form={formId} name="is_active" type="checkbox" defaultChecked={user.is_active} className="h-4 w-4 accent-brand" disabled={protectedAccount} />
                    <span>{user.is_active ? t("active") : t("inactive")}</span>
                  </label>
                </td>
                <td className="min-w-48 px-4 py-3">
                  <div className="flex gap-2">
                    <Button type="submit" form={formId} variant="secondary" disabled={pendingAction !== null || protectedAccount}>{pendingAction === `save-${user.id}` ? t("saving") : t("save")}</Button>
                    <Button type="button" variant="danger" disabled={pendingAction !== null || protectedAccount || user.id === profileQuery.data?.id} onClick={() => void deleteUser(user)}>{pendingAction === `delete-${user.id}` ? t("deleting") : t("delete")}</Button>
                  </div>
                  {protectedAccount && <span className="mt-1 block text-xs text-slate-500">{t("superuserProtected")}</span>}
                </td>
              </tr>;
              })}
            </tbody>
          </table>
        </div>}

      {!isLoading && !isError && (data?.count || 0) > PAGE_SIZE && <nav aria-label={t("userPagination")} className="mt-4 flex items-center justify-between gap-3">
        <Button variant="secondary" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>{t("previous")}</Button>
        <span className="text-sm text-slate-500">{t("page")} {filters.page} / {pageCount}</span>
        <Button variant="secondary" disabled={filters.page >= pageCount} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>{t("next")}</Button>
      </nav>}
    </section>
  </div>;
}
