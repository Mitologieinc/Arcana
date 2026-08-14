export type PageTemplate = {
  id: string;
  label: string;
  hint: string;
  icon: string;
  title: string;
  doc: { type: "doc"; content: unknown[] };
};

function h(level: number, text: string) {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

function p(text?: string) {
  return text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
}

function bullets(...items: string[]) {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [p(item || undefined)],
    })),
  };
}

function todos(...items: string[]) {
  return {
    type: "taskList",
    content: items.map((item) => ({
      type: "taskItem",
      attrs: { checked: false },
      content: [p(item || undefined)],
    })),
  };
}

export function savedToChip(t: {
  id: string;
  name: string;
  icon: string | null;
  title: string;
  doc: { type: "doc"; content: unknown[] };
}): PageTemplate {
  return {
    id: t.id,
    label: t.name,
    hint: "ワークスペース",
    icon: t.icon || "📄",
    title: t.title || t.name,
    doc: t.doc,
  };
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "memo",
    label: "メモ",
    hint: "短い記録",
    icon: "📝",
    title: "メモ",
    doc: {
      type: "doc",
      content: [
        {
          type: "callout",
          attrs: { emoji: "📝" },
          content: [p("あとで戻って読める一文")],
        },
        p(),
      ],
    },
  },
  {
    id: "meeting",
    label: "会議メモ",
    hint: "議事と次の行動",
    icon: "📅",
    title: "会議メモ",
    doc: {
      type: "doc",
      content: [
        h(2, "出席"),
        bullets(""),
        h(2, "議題"),
        bullets(""),
        h(2, "決めたこと"),
        bullets(""),
        h(2, "次の行動"),
        todos(""),
      ],
    },
  },
  {
    id: "tasks",
    label: "ToDo",
    hint: "今日とあとで",
    icon: "✅",
    title: "ToDo",
    doc: {
      type: "doc",
      content: [h(2, "今日"), todos(""), h(2, "あとで"), todos("")],
    },
  },
];
