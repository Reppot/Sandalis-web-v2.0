import * as React from "react";
import type { FoxholeItem } from "@/entities/item";
import { Card } from "@/shared";
import { Copy, Check } from "lucide-react";

interface CodeCardProps {
  item: FoxholeItem;
}

export const CodeCard: React.FC<CodeCardProps> = ({ item }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(item.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card hoverable className="p-4 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase bg-sindaris-accent/15 text-sindaris-accent px-1.5 py-0.5 rounded-sm">
            {item.category}
          </span>
          <span className="text-xs text-sindaris-muted">ящик: {item.crateSize} шт</span>
        </div>
        <h4 className="font-bold text-sm text-sindaris-text truncate mt-1">{item.name}</h4>
        <p className="text-xs text-sindaris-muted truncate">{item.englishName}</p>
      </div>

      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-sindaris-bg border border-sindaris-border hover:border-sindaris-accent transition-colors font-mono text-sm font-bold text-sindaris-accent cursor-pointer shrink-0"
        title="Скопировать код"
      >
        <span>{item.code}</span>
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 text-sindaris-muted" />}
      </button>
    </Card>
  );
};