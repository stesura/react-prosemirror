import { EditorState } from "prosemirror-state";
import { createContext, useContext, useSyncExternalStore } from "react";

import type { DocNodeViewContextValue } from "../components/ProseMirrorDoc.js";

/**
 * Backs the `stableContexts` option. With it on, EditorStateContext and
 * DocNodeViewContext keep their values across a transaction dispatched
 * through flushSync, so React does not scan every memoised node view for
 * their consumers. The consumers subscribe here instead: `announce` runs
 * inside that flushSync, before React renders, so they re-render in the same
 * commit as the doc and read the values ProseMirrorInner wrote during its
 * render.
 */
export interface RenderStore {
  state: EditorState | null;
  doc: DocNodeViewContextValue | null;
  /** Set by `announce`, consumed by the next ProseMirrorInner render. */
  announced: boolean;
  getVersion: () => number;
  subscribe: (listener: () => void) => () => void;
  announce: () => void;
}

export const createRenderStore = (): RenderStore => {
  const listeners = new Set<() => void>();
  let version = 0;
  const store: RenderStore = {
    state: null,
    doc: null,
    announced: false,
    getVersion: () => version,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    announce: () => {
      // Nobody to re-render through the store: let the contexts change.
      if (!listeners.size) return;
      store.announced = true;
      version++;
      listeners.forEach((listener) => listener());
    },
  };
  return store;
};

export const RenderStoreContext = createContext<RenderStore | null>(null);

const inertStore = createRenderStore();

/** Subscribes to announced transactions; null when `stableContexts` is off. */
export const useRenderStore = () => {
  const store = useContext(RenderStoreContext);
  const subscribed = store ?? inertStore;
  useSyncExternalStore(
    subscribed.subscribe,
    subscribed.getVersion,
    subscribed.getVersion
  );
  return store;
};
