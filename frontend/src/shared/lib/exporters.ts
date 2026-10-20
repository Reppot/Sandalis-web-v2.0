"use client";

/**
 * Экспорт рапортов терминала: TXT, XLSX, PNG-страницы 650×1000 и буфер обмена.
 * Перенос src/lib/exporters.ts + tool-export.ts старого сайта в одну модель документа:
 * рапорт склада/заказа — одна секция строк, расчёт калькулятора — несколько секций.
 */
import { fileStamp, formatDateTime } from "@/shared/lib/time";

export interface ExportRow {
  name: string;
  /** Число или готовое значение («1ч 05м»). */
  quantity: number | string;
  unit: string;
  note?: string;
}

export interface ExportSection {
  label?: string;
  rows: ExportRow[];
}

/** Подписи файлов экспорта на языке интерфейса (useDocExport подставляет их сам). */
export interface ExportLabels {
  generated: string;
  page: string;
  sheet: string;
  name: string;
  quantity: string;
  unit: string;
  footer: string;
}

const RU_LABELS: ExportLabels = {
  generated: "Сформировано",
  page: "Стр.",
  sheet: "Лист",
  name: "Название",
  quantity: "Количество",
  unit: "Ед. изм.",
  footer: "SINDARIS LOGISTICS OVERWATCH • ТАКТИЧЕСКИЙ РАПОРТ",
};

export interface ExportDoc {
  /** Заголовок страницы: «SINDARIS • Заказ снабжения». */
  title: string;
  /** Строки шапки: «Гекс: …», «Режим: …». */
  header: string[];
  sections: ExportSection[];
  /** Основа имени файла без даты: «SINDARIS_заказ». */
  fileBase: string;
  footer?: string;
  /** Имя листа XLSX для первой секции (лист совместим с импортом конструктора). */
  sheetName?: string;
  labels?: ExportLabels;
}

const PAGE_W = 650;
const PAGE_H = 1000;
const ENTRIES_PER_PAGE = 14;
const ENTRY_STEP = 52;

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function formatQuantity(row: ExportRow): string {
  const value = typeof row.quantity === "number" ? row.quantity.toLocaleString("ru-RU") : row.quantity;
  return row.unit ? `${value} ${row.unit}` : value;
}

function rowLine(row: ExportRow): string {
  const note = row.note ? ` (${row.note})` : "";
  return `${row.name} -> ${formatQuantity(row)}${note}`;
}

/** Одна секция без подписи — формат «Название -> N ед.», который понимает парсер сервера. */
export function buildTxt(doc: ExportDoc, date: Date = new Date()): string {
  const plain = doc.sections.length === 1 && !doc.sections[0].label;
  if (plain) return doc.sections[0].rows.map(rowLine).join("\n") + "\n";
  const L = doc.labels ?? RU_LABELS;
  const lines = [doc.title, ...doc.header, `${L.generated}: ${formatDateTime(date)}`, ""];
  for (const section of doc.sections) {
    if (section.label) lines.push(`${section.label}:`);
    lines.push(...(section.rows.length ? section.rows.map(rowLine) : ["—"]), "");
  }
  return lines.join("\n");
}

export function exportTxt(doc: ExportDoc): void {
  downloadBlob(new Blob([buildTxt(doc)], { type: "text/plain;charset=utf-8" }), `${doc.fileBase}_${fileStamp()}.txt`);
}

export async function exportXlsx(doc: ExportDoc): Promise<void> {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  const L = doc.labels ?? RU_LABELS;
  doc.sections.forEach((section, index) => {
    const name = (index === 0 ? doc.sheetName : section.label) ?? section.label ?? `${L.sheet} ${index + 1}`;
    const ws = wb.addWorksheet(name.replace(/[\\/?*[\]:]/g, " ").slice(0, 30));
    ws.columns = [
      { header: L.name, key: "name", width: 44 },
      { header: L.quantity, key: "quantity", width: 14 },
      { header: L.unit, key: "unit", width: 10 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const row of section.rows) ws.addRow({ name: row.name, quantity: row.quantity, unit: row.unit });
  });
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${doc.fileBase}_${fileStamp()}.xlsx`,
  );
}

/** Первый лист XLSX → строки «Название, количество ед.» для серверного парсера. */
export async function xlsxToText(file: File): Promise<string> {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return "";
  const header = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? "").toLowerCase());
  const col = (re: RegExp, fallback: number) => {
    const idx = header.findIndex((h) => re.test(h));
    return idx > 0 ? idx : fallback;
  };
  const nameCol = col(/назван|name|item|предмет/, 1);
  const countCol = col(/кол|count|qty|quantity|amount/, 2);
  const unitCol = header.findIndex((h) => /ед|unit/.test(h));
  const lines: string[] = [];
  ws.eachRow((row, index) => {
    if (index === 1 && header.some((h) => /назван|name|кол|count/.test(h))) return;
    const name = String(row.getCell(nameCol).text ?? "").trim();
    const count = String(row.getCell(countCol).text ?? "").trim();
    const unit = unitCol > 0 ? String(row.getCell(unitCol).text ?? "").trim() : "";
    if (name && count) lines.push(`${name} -> ${count} ${unit}`.trim());
  });
  return lines.join("\n");
}

// ─────────────────────────────── PNG ───────────────────────────────
type PageEntry = { kind: "section"; label: string } | { kind: "row"; name: string; value: string };

const textureCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadTexture(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  if (!textureCache.has(url)) {
    textureCache.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      }),
    );
  }
  return textureCache.get(url)!;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  let label = text;
  while (ctx.measureText(label).width > maxWidth && label.length > 6) label = label.slice(0, -2) + "…";
  return label;
}

function paginate(doc: ExportDoc): PageEntry[][] {
  const entries: PageEntry[] = [];
  for (const section of doc.sections) {
    if (section.label) entries.push({ kind: "section", label: section.label });
    for (const row of section.rows) {
      entries.push({ kind: "row", name: row.note ? `${row.name} (${row.note})` : row.name, value: `x ${formatQuantity(row)}` });
    }
  }
  const pages: PageEntry[][] = [[]];
  for (const entry of entries) {
    const current = pages[pages.length - 1];
    // заголовок секции не остаётся последней строкой листа
    const limit = entry.kind === "section" ? ENTRIES_PER_PAGE - 1 : ENTRIES_PER_PAGE;
    if (current.length >= limit) pages.push([entry]);
    else current.push(entry);
  }
  return pages;
}

function drawPage(ctx: CanvasRenderingContext2D, texture: HTMLImageElement | null, entries: PageEntry[], page: number, total: number, doc: ExportDoc) {
  ctx.fillStyle = "#1f2321";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  if (texture) {
    const scale = Math.max(PAGE_W / texture.width, PAGE_H / texture.height);
    const w = texture.width * scale;
    const h = texture.height * scale;
    ctx.drawImage(texture, (PAGE_W - w) / 2, (PAGE_H - h) / 2, w, h);
    ctx.fillStyle = "rgba(10,14,11,0.72)";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  }
  ctx.strokeStyle = "rgba(163,230,53,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, PAGE_W - 36, PAGE_H - 36);
  ctx.strokeStyle = "rgba(156,143,128,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(26, 26, PAGE_W - 52, PAGE_H - 52);

  ctx.fillStyle = "#a3e635";
  ctx.font = "bold 22px Arial";
  ctx.fillText(fitText(ctx, doc.title.toUpperCase(), 450), 40, 62);
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "18px Arial";
  doc.header.slice(0, 3).forEach((line, i) => ctx.fillText(fitText(ctx, line, 570), 40, 96 + i * 26));
  ctx.fillStyle = "#60a5fa";
  ctx.font = "16px Arial";
  ctx.textAlign = "right";
  ctx.fillText(`${(doc.labels ?? RU_LABELS).page} ${page}/${total}`, PAGE_W - 40, 62);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "13px Arial";
  ctx.fillText(formatDateTime(new Date()), PAGE_W - 40, 86);
  ctx.textAlign = "left";

  ctx.strokeStyle = "#4b5563";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 170);
  ctx.lineTo(PAGE_W - 40, 170);
  ctx.stroke();

  let y = 200;
  let rowIndex = 0;
  for (const entry of entries) {
    if (entry.kind === "section") {
      ctx.fillStyle = "#60a5fa";
      ctx.font = "bold 15px Arial";
      ctx.fillText(entry.label, 44, y + 4);
      ctx.strokeStyle = "rgba(96,165,250,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(44, y + 14);
      ctx.lineTo(PAGE_W - 44, y + 14);
      ctx.stroke();
      rowIndex = 0;
    } else {
      if (rowIndex % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.045)";
        ctx.fillRect(34, y - 26, PAGE_W - 68, 46);
      }
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "18px Arial";
      ctx.fillText(fitText(ctx, `•  ${entry.name}`, 400), 44, y + 4);
      ctx.fillStyle = "#a3e635";
      ctx.font = "bold 18px Arial";
      ctx.textAlign = "right";
      ctx.fillText(entry.value, PAGE_W - 48, y + 4);
      ctx.textAlign = "left";
      rowIndex += 1;
    }
    y += ENTRY_STEP;
  }

  ctx.fillStyle = "rgba(163,230,53,0.7)";
  ctx.font = "bold 12px Arial";
  ctx.fillText(doc.footer ?? (doc.labels ?? RU_LABELS).footer, 40, PAGE_H - 40);
}

/** Страницы 650×1000, до 14 строк на лист; textureUrl — фон рапорта из реестра медиа. */
export async function renderPages(doc: ExportDoc, textureUrl?: string | null): Promise<HTMLCanvasElement[]> {
  const texture = await loadTexture(textureUrl);
  const pages = paginate(doc);
  return pages.map((entries, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext("2d");
    if (ctx) drawPage(ctx, texture, entries, index + 1, pages.length, doc);
    return canvas;
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
