/* Copyright (c) The New York Times Company */
import type { EditorState } from "prosemirror-state";
import { useContext } from "react";

import { EditorStateContext } from "../contexts/EditorStateContext.js";
import { useRenderStore } from "../contexts/RenderStoreContext.js";

/**
 * Provides access to the current EditorState value.
 */
export function useEditorState(): EditorState {
  const editorState = useContext(EditorStateContext);
  const store = useRenderStore();

  return store?.state ?? editorState;
}
