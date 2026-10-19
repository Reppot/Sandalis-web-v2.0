import * as React from "react";
import { Button } from "@/shared";

interface AuthRequiredProps {
  onOpenCabinet: () => void;
}

export const AuthRequired: React.FC<AuthRequiredProps> = ({ onOpenCabinet }) => {
  return (
    <div className="p-12 text-center rounded-lg border border-dashed border-sindaris-border text-sindaris-muted font-mono space-y-4">
      <p>Нужна сессия клана. Войдите через Discord в кабинете.</p>
      <Button onClick={onOpenCabinet}>Открыть кабинет</Button>
    </div>
  );
};
