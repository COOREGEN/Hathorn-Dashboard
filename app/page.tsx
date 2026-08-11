import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const s = await getSession();
  if (!s) redirect("/login");
  // Clients get the statement — a document. Staff get the dashboard — a tool.
  if (s.role === "CLIENT") redirect("/portal");
  if (s.role === "BOOKKEEPER") redirect("/upload");
  // Advisors open with "who needs me this month", not with one client's dashboard.
  // The front door is a briefing, not a data table: one line of state and the two or
  // three things that actually need doing.
  if (s.role === "ADMIN" || s.role === "ADVISOR") redirect("/today");
  redirect("/dash");
}
