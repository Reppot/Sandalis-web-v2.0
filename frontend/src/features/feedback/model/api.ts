import { apiClient } from "@/shared";

/** Обратная связь о сайте (/api/v1/feedback): свои сообщения; владельцу сайта — все. */
export type FeedbackCategory = "idea" | "bug" | "other";
export type FeedbackStatus = "new" | "read" | "done";

export interface Feedback {
  id: string;
  user_id: string;
  user_name: string;
  clan_id: string | null;
  clan_name: string | null;
  category: FeedbackCategory;
  message: string;
  page: string | null;
  status: FeedbackStatus;
  created_at: string;
}

export interface FeedbackOverview {
  is_admin: boolean;
  can_write: boolean;
  mine: Feedback[];
  inbox: Feedback[];
  unread: number;
}

export const feedbackApi = {
  overview: () => apiClient.get<FeedbackOverview>("/api/v1/feedback"),
  send: (data: { category: FeedbackCategory; message: string; page?: string | null }) => apiClient.post<Feedback>("/api/v1/feedback", data),
  setStatus: (id: string, status: FeedbackStatus) => apiClient.patch<Feedback>(`/api/v1/feedback/${id}`, { status }),
  remove: (id: string) => apiClient.delete<void>(`/api/v1/feedback/${id}`),
};
