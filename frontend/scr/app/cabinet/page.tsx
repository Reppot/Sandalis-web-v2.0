import { CabinetGate, CabinetView } from "@/features/cabinet";

export default function CabinetPage() {
  // Gate: есть сессия — кабинет, нет — редирект на «/»
  return (
    <CabinetGate>
      <CabinetView />
    </CabinetGate>
  );
}
