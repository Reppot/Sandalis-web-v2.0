import { redirect } from "next/navigation";

// Терминал — одна страница с вкладками; прямые ссылки ведут на нужную вкладку.
export default function Page() {
  redirect("/?tab=training");
}
