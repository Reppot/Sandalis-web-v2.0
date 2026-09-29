// Контракт ответа FastAPI — зеркалит docs/openapi.yaml.
// Перевод snake_case → camelCase делает orders-mapping, и только он.
export interface OrderDto {
  id: number;
  item_id: number;
  item_name: string;
  quantity_kg: number;
  status: "new" | "crafting" | "ready" | "done";
  deadline: string; // ISO 8601
}
