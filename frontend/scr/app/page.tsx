import { LoginForm } from "@/features/cabinet";

// Публичная страница: лендинг терминала + форма входа.
// Сегодня она же «/» в proxy.ts — единственная открытая страница.
export default function HomePage() {
  return (
    <main>
      {/* герой терминала */}
      <LoginForm />
    </main>
  );
}
