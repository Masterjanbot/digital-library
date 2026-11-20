import { PasswordResetConfirm } from "@/components/password-reset";
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ uid?: string; token?: string }> }) {
  const { uid = "", token = "" } = await searchParams;
  return <PasswordResetConfirm uid={uid} token={token} />;
}
