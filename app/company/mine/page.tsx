import { redirect } from "next/navigation";
import { getShell } from "@/lib/server/view";

export const dynamic = "force-dynamic";

export default async function MyCompany() {
  const s = await getShell();
  redirect(s.links.founder);
}
