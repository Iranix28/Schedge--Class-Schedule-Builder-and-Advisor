import { redirect } from "next/navigation";

export default function DashboardHomePage() {
  redirect("/plans/new");
}
