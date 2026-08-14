import { createContext, useContext } from "react";
import type { User } from "../lib/types";

export type EditorChromeValue = {
  user: User;
  editable: boolean;
  shareToken?: string;
  onOpenPage?: (id: string) => void;
  onPagesChanged?: () => Promise<unknown>;
};

export const EditorChromeContext = createContext<EditorChromeValue | null>(null);

export function useEditorChrome() {
  return useContext(EditorChromeContext);
}
