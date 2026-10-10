import { act } from "@testing-library/react";
import { Plugin, PluginKey } from "prosemirror-state";
import { doc, em, p, strong } from "prosemirror-test-builder";
import { Decoration, DecorationSet } from "prosemirror-view";
import React, { forwardRef } from "react";

import { tempEditor } from "../../testing/editorViewTestHelpers.js";
import { MarkViewComponentProps } from "../marks/MarkViewComponentProps.js";

/**
 * Inline children are partitioned by their outermost mark and each partition
 * is rendered under one `MarkView`. Partitions must keep their identity while
 * their children are unchanged, so editing one run re-renders only that run's
 * mark view.
 */

const renders: string[] = [];

const markView = (tag: string) =>
  forwardRef<HTMLElement, MarkViewComponentProps>(function Recorded(
    props,
    ref
  ) {
    renders.push(`${tag}@${props.markProps.getPos()}`);
    return React.createElement(tag, { ref }, props.children);
  });

const markViewComponents = { strong: markView("strong"), em: markView("em") };

const decorationsKey = new PluginKey<DecorationSet>("decorations");
const decorationsPlugin = new Plugin<DecorationSet>({
  key: decorationsKey,
  state: {
    init: () => DecorationSet.empty,
    apply: (tr, set) =>
      tr.getMeta(decorationsKey) ?? set.map(tr.mapping, tr.doc),
  },
  props: {
    decorations: (state) => decorationsKey.getState(state),
  },
});

describe("inline partitions", () => {
  beforeEach(() => {
    renders.length = 0;
  });

  // Positions: aa 1–3, bb 3–5, cc 5–7, dd 7–9, ee 9–11, ff 11–13
  const runs = () =>
    doc(p("aa", strong("bb"), "cc", strong("dd"), "ee", strong("ff")));

  it("renders every mark on mount", () => {
    tempEditor({ doc: runs(), markViewComponents });
    expect(new Set(renders)).toEqual(
      new Set(["strong@3", "strong@7", "strong@11"])
    );
  });

  it("re-renders only the run that was edited", () => {
    const { view } = tempEditor({ doc: runs(), markViewComponents });
    renders.length = 0;

    act(() => view.dispatch(view.state.tr.insertText("x", 4)));

    expect(view.dom.querySelector("p")?.textContent).toBe("aabxbccddeeff");
    expect(renders).toEqual(["strong@3"]);
  });

  it("re-renders a run whose decorations changed", () => {
    const { view } = tempEditor({
      doc: runs(),
      markViewComponents,
      plugins: [decorationsPlugin],
    });
    renders.length = 0;

    act(() =>
      view.dispatch(
        view.state.tr.setMeta(
          decorationsKey,
          DecorationSet.create(view.state.doc, [
            Decoration.inline(7, 9, { class: "hl" }),
          ])
        )
      )
    );

    expect(view.dom.querySelector(".hl")?.textContent).toBe("dd");
    expect(renders).toEqual(["strong@7"]);
  });

  it("keeps nested partitions when a sibling run changes", () => {
    // Positions: aa 1–3, bb 3–5, cc 5–7, all em; bb also strong. em ranks
    // before strong in the test schema, so em is the outer partition.
    const { view } = tempEditor({
      doc: doc(p(em("aa"), em(strong("bb")), em("cc"))),
      markViewComponents,
    });
    expect(new Set(renders)).toEqual(new Set(["em@1", "strong@3"]));
    renders.length = 0;

    act(() => view.dispatch(view.state.tr.insertText("x", 6)));

    expect(view.dom.querySelector("p")?.textContent).toBe("aabbcxc");
    expect(renders).toEqual(["em@1"]);
  });
});
