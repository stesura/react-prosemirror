import { act, render } from "@testing-library/react";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { doc, p } from "prosemirror-test-builder";
import { EditorView } from "prosemirror-view";
import React, {
  memo,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";

import { EditorStateContext } from "../../contexts/EditorStateContext.js";
import { useEditorEffect } from "../../hooks/useEditorEffect.js";
import { useEditorState } from "../../hooks/useEditorState.js";
import { reactKeys } from "../../plugins/reactKeys.js";
import {
  setupProseMirrorView,
  teardownProseMirrorView,
} from "../../testing/setupProseMirrorView.js";
import { ProseMirror } from "../ProseMirror.js";
import { DocNodeViewContext, ProseMirrorDoc } from "../ProseMirrorDoc.js";

/**
 * The `stableContexts` option relies on a `useSyncExternalStore` consumer
 * landing in the same commit as its parent's state update when the store is
 * notified inside flushSync. The pure-React cases pin that down; the editor
 * cases are the invariants the option must keep, run with it off and on.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

// Dispatches run outside act on purpose: act would batch them and hide
// whether the doc renders in the dispatch's own commit. React Testing
// Library turns the act environment back on inside render and act.
let actEnvironment: boolean | undefined;
const leaveActEnvironment = () => {
  actEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
};
const restoreActEnvironment = () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = actEnvironment;
};

const createStore = <T,>(initial: T) => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
    },
    notify: () => listeners.forEach((listener) => listener()),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

type Store = ReturnType<typeof createStore<number>>;

/** Provider owner, memoised doc reading the store, a layout effect reading the doc's DOM. */
const mountHarness = (notifyIn: "dispatch" | "render" | "layoutEffect") => {
  const store = createStore(0);
  const log = { docRenders: 0, commits: [] as string[] };
  let setValue: (value: number) => void = () => undefined;

  const DocView = ({ store }: { store: Store }) => {
    const value = useSyncExternalStore(store.subscribe, store.get);
    log.docRenders++;
    return <span data-testid="doc">{value}</span>;
  };
  const Doc = memo(DocView);

  const Inner = ({ value }: { value: number }) => {
    if (notifyIn === "render" && store.get() !== value) {
      store.set(value);
      store.notify();
    }
    useLayoutEffect(() => {
      if (notifyIn === "layoutEffect" && store.get() !== value) {
        store.set(value);
        store.notify();
      }
    }, [value]);
    // Stands in for commitPendingEffects: reads the doc DOM in the commit.
    useLayoutEffect(() => {
      log.commits.push(
        `${value}:${document.querySelector("[data-testid=doc]")?.textContent}`
      );
    });
    return <Doc store={store} />;
  };

  const Root = () => {
    const [value, set] = useState(0);
    setValue = set;
    return <Inner value={value} />;
  };

  render(<Root />);
  log.commits.length = 0;
  log.docRenders = 0;

  const dispatch = (value: number) =>
    flushSync(() => {
      if (notifyIn === "dispatch") {
        store.set(value);
        store.notify();
      }
      setValue(value);
    });
  return { dispatch, log };
};

describe("useSyncExternalStore consumer vs the parent's commit", () => {
  beforeAll(leaveActEnvironment);
  afterAll(restoreActEnvironment);

  it("store set and notified inside flushSync, before the state update: same commit", () => {
    const { dispatch, log } = mountHarness("dispatch");

    dispatch(1);

    expect(log.commits).toEqual(["1:1"]);
    expect(log.docRenders).toBe(1);
  });

  it("notified from a layout effect (EditorStateSelectorsProvider): a second pass", () => {
    const { dispatch, log } = mountHarness("layoutEffect");

    dispatch(1);

    expect(log.commits[0]).toBe("1:0");
  });

  // Lands in the same commit, but it is a render-phase update of another
  // component: React warns and does not promise the behaviour.
  it("set and notified during the parent's render: same commit, with React's render-phase warning", () => {
    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { dispatch, log } = mountHarness("render");

    dispatch(1);

    expect(log.commits).toEqual(["1:1"]);
    expect(String(error.mock.calls[0]?.[0])).toContain(
      "Cannot update a component"
    );
    error.mockRestore();
  });
});

for (const stableContexts of [false, true]) {
  describe(`stableContexts ${stableContexts}`, () => {
    beforeAll(() => {
      leaveActEnvironment();
      setupProseMirrorView();
    });
    afterAll(() => {
      restoreActEnvironment();
      teardownProseMirrorView();
    });

    // The start of "hello world"'s text.
    const start = 1;

    const mountEditor = (plugins: Plugin[] = []) => {
      const captured: {
        view?: EditorView;
        setState?: (state: EditorState) => void;
      } = {};
      const CaptureView = () => {
        useEditorEffect((view) => {
          captured.view = view;
        }, []);
        return null;
      };
      // Memoised, so only a state subscription re-renders it.
      const StateTextView = () => (
        <output>{useEditorState()?.doc.textContent}</output>
      );
      const StateText = memo(StateTextView);
      // Reads the contexts directly, as React's scan sees them.
      const contextRenders: unknown[][] = [];
      const ContextProbeView = () => {
        contextRenders.push([
          useContext(EditorStateContext),
          useContext(DocNodeViewContext),
        ]);
        return null;
      };
      const ContextProbe = memo(ContextProbeView);
      const Editor = () => {
        const [state, setState] = useState(() =>
          EditorState.create({
            doc: doc(p("hello world")),
            plugins: [reactKeys(), ...plugins],
          })
        );
        captured.setState = setState;
        return (
          <ProseMirror
            state={state}
            dispatchTransaction={(tr) => setState((s) => s.apply(tr))}
            stableContexts={stableContexts}
          >
            <ProseMirrorDoc />
            <CaptureView />
            <StateText />
            <ContextProbe />
          </ProseMirror>
        );
      };
      const { container } = render(<Editor />);
      const { view, setState } = captured;
      if (!view || !setState) throw new Error("no view");
      return { view, setState, container, contextRenders };
    };

    const domSelectionPos = (view: EditorView) => {
      const selection = document.getSelection();
      if (!selection?.anchorNode) throw new Error("no DOM selection");
      return view.posAtDOM(selection.anchorNode, selection.anchorOffset);
    };

    it("the DOM selection matches the state as soon as dispatch returns", () => {
      const { view } = mountEditor();
      act(() => view.focus());

      for (const offset of [3, 7, 1, 11]) {
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.create(view.state.doc, start + offset)
          )
        );
        expect(domSelectionPos(view)).toBe(start + offset);
      }
      view.dispatch(view.state.tr.insertText("!", start + 5));
      expect(domSelectionPos(view)).toBe(view.state.selection.anchor);
      expect(view.dom.textContent).toBe("hello! world");
    });

    it("a memoised useEditorState consumer renders in the dispatch", () => {
      const { view, container } = mountEditor();
      act(() => view.focus());

      view.dispatch(view.state.tr.insertText("X", start));

      expect(container.querySelector("output")?.textContent).toBe(
        "Xhello world"
      );
    });

    it(`${
      stableContexts ? "keeps" : "changes"
    } the context values on a dispatch`, () => {
      const { view, contextRenders } = mountEditor();
      const before = contextRenders.length;

      view.dispatch(view.state.tr.insertText("X", start));

      expect(contextRenders.length - before).toBe(stableContexts ? 0 : 1);
    });

    // Not announced (a remote step, say): the context path must still render.
    it("a state change outside dispatch reaches the doc and consumers", () => {
      const { view, setState, container } = mountEditor();
      const next = view.state.apply(view.state.tr.insertText("Y", start));

      act(() => setState(next));

      expect(view.dom.textContent).toBe("Yhello world");
      expect(container.querySelector("output")?.textContent).toBe(
        "Yhello world"
      );
    });

    // Plugin views update in the commit's layout effects, where a dispatch
    // does not go through flushSync and is not announced.
    it("a transaction dispatched from a plugin view's update reaches the doc and consumers", () => {
      const echo = new Plugin({
        view: () => ({
          update: (view) => {
            const text = view.state.doc.textContent;
            if (text.startsWith("Z") && !text.endsWith("?")) {
              view.dispatch(
                view.state.tr.insertText("?", view.state.doc.content.size - 1)
              );
            }
          },
        }),
      });
      const { view, container } = mountEditor([echo]);
      act(() => view.focus());

      view.dispatch(view.state.tr.insertText("Z", start));

      expect(view.state.doc.textContent).toBe("Zhello world?");
      expect(view.dom.textContent).toBe("Zhello world?");
      expect(container.querySelector("output")?.textContent).toBe(
        "Zhello world?"
      );
    });
  });
}
