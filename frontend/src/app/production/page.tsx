import { redirect } from "next/navigation";

// Старый адрес вкладки v2 — раздел переехал.
export default function Page() {
  redirect("/?tab=tools");
}
