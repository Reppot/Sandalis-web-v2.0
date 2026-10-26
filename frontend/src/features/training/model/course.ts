import { apiClient } from "@/shared";

/* Курс — общий формат для курсов разработчика (готовый JSON) и курсов клана (разметка → блоки). */

/** Кусок текста: [текст, флаги b/u/i, ссылка?]. */
export type Run = [string, string, string?];

export type Block =
  | { t: "p"; r: Run[] }
  | { t: "h"; r: Run[] }
  | { t: "li"; lvl: number; o: boolean; r: Run[] }
  | { t: "img"; src: string; w: number; h: number; alt?: string }
  | { t: "gallery"; imgs: { t: "img"; src: string; w: number; h: number }[] }
  | { t: "cols"; cols: Block[][] };

export interface Topic {
  title: string;
  blocks: Block[];
}

export interface Section {
  title: string;
  topics: Topic[];
}

export interface Course {
  key: string;
  title: string;
  summary: string;
  icon?: string;
  sections: Section[];
}

export interface DevCourses {
  title: string;
  credits: string[];
  release: string | null;
  about: Topic[];
  courses: Course[];
}

export interface ClanCourse {
  id: string;
  title: string;
  summary: string;
  body: string;
  sort: number;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export interface ClanCourseList {
  can_edit: boolean;
  max_courses: number;
  courses: ClanCourse[];
}

export interface ClanCourseInput {
  title: string;
  summary: string;
  body: string;
}

/** Версия в адресе — кэш статики (7 дней) сбрасывается при обновлении курса. */
const DEV_COURSES_URL = "/api/v1/assets/training/dev/courses.json?v=2026-10-27-r";
const ADV_COURSES_URL = "/api/v1/assets/training/adv/courses.json?v=2026-10-27-a";

const loadCourses = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<DevCourses>;
});

export const trainingApi = {
  /** Базовый и продвинутый курсы разработчика. */
  devCourses: () => Promise.all([loadCourses(DEV_COURSES_URL), loadCourses(ADV_COURSES_URL)]),
  clanCourses: () => apiClient.get<ClanCourseList>("/api/v1/clan/courses"),
  create: (body: ClanCourseInput) => apiClient.post<ClanCourse>("/api/v1/clan/courses", body),
  update: (id: string, body: ClanCourseInput) => apiClient.put<ClanCourse>(`/api/v1/clan/courses/${id}`, body),
  reorder: (ids: string[]) => apiClient.put<ClanCourseList>("/api/v1/clan/courses", { ids }),
  remove: (id: string) => apiClient.delete<void>(`/api/v1/clan/courses/${id}`),
};

export const topicCount = (c: Course) => c.sections.reduce((n, s) => n + s.topics.length, 0);

/* ───────────── разметка курсов клана ─────────────
 * # Тема              → раздел оглавления
 * ## Подтема          → страница курса
 * ### Подзаголовок    → заголовок внутри страницы
 * - пункт / * пункт   → список (2 пробела отступа — уровень вложенности), 1. — нумерованный
 * ![подпись](https://…) → картинка; **жирный**, __подчёркнутый__, *курсив*, [текст](https://…)
 * Пустая строка — новый абзац. */

const SAFE_URL = /^https?:\/\//i;

export function parseRuns(text: string): Run[] {
  const out: Run[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push([text.slice(last, m.index), ""]);
    if (m[1] !== undefined) out.push([m[1], "b"]);
    else if (m[2] !== undefined) out.push([m[2], "u"]);
    else if (m[3] !== undefined) out.push([m[3], "i"]);
    else if (SAFE_URL.test(m[5])) out.push([m[4], "", m[5]]);
    else out.push([m[4], ""]);
    last = re.lastIndex;
  }
  if (last < text.length) out.push([text.slice(last), ""]);
  return out;
}

export function parseMarkup(title: string, summary: string, body: string, key: string): Course {
  const sections: Section[] = [];
  let section: Section | null = null;
  let topic: Topic | null = null;
  let para: string[] = [];

  const ensureTopic = () => {
    if (!section) {
      section = { title: "", topics: [] };
      sections.push(section);
    }
    if (!topic) {
      topic = { title: "", blocks: [] };
      section.topics.push(topic);
    }
    return topic;
  };
  const flush = () => {
    if (para.length) ensureTopic().blocks.push({ t: "p", r: parseRuns(para.join(" ")) });
    para = [];
  };

  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#\s+(.+)/))) {
      flush();
      section = { title: m[1].trim(), topics: [] };
      sections.push(section);
      topic = null;
    } else if ((m = line.match(/^##\s+(.+)/))) {
      flush();
      if (!section) {
        section = { title: "", topics: [] };
        sections.push(section);
      }
      topic = { title: m[1].trim(), blocks: [] };
      section.topics.push(topic);
    } else if ((m = line.match(/^###\s+(.+)/))) {
      flush();
      ensureTopic().blocks.push({ t: "h", r: parseRuns(m[1].trim()) });
    } else if ((m = line.match(/^\s*!\[([^\]]*)\]\((\S+)\)\s*$/))) {
      flush();
      if (SAFE_URL.test(m[2])) ensureTopic().blocks.push({ t: "img", src: m[2], w: 0, h: 0, alt: m[1] });
    } else if ((m = line.match(/^(\s*)([-*•]|\d+[.)])\s+(.+)/))) {
      flush();
      ensureTopic().blocks.push({ t: "li", lvl: Math.min(3, Math.floor(m[1].length / 2)), o: /\d/.test(m[2]), r: parseRuns(m[3]) });
    } else {
      para.push(line.trim());
    }
  }
  flush();
  if (!sections.length) sections.push({ title: "", topics: [{ title: "", blocks: [] }] });
  return { key, title, summary, sections };
}
