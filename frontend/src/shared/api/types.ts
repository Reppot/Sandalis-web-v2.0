export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// Мутации бэкенда возвращают сущность + локализованное `message` для тоста.

export interface CreatedOrderEnvelope<T> {
  order: T;
  message: string;
}

export interface CreatedStockpileEnvelope<T> {
  stockpile: T;
  message: string;
}

export interface CreatedTimerEnvelope<T> {
  timer: T;
  message: string;
}

export interface SavedItemEnvelope<T> {
  item: T;
  message: string;
}

export interface CreatedInviteEnvelope<T> {
  invite: T;
  message: string;
}
