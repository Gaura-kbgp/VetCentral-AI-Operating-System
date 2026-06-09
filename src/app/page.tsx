import { redirect } from "next/navigation";

// Root redirects to dashboard — proxy.ts sends unauthenticated users to /login
export default function RootPage() {
  redirect("/dashboard");
}
