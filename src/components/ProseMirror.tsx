import React, {
  ComponentType,
  ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ChildDescriptionsContext,
  ChildDescriptionsContextValue,
} from "../contexts/ChildDescriptionsContext.js";
import { EditorContext } from "../contexts/EditorContext.js";
import { EditorStateContext } from "../contexts/EditorStateContext.js";
import {
  NodeViewContext,
  NodeViewContextValue,
} from "../contexts/NodeViewContext.js";
import { RenderStoreContext } from "../contexts/RenderStoreContext.js";
import { computeDocDeco } from "../decorations/computeDocDeco.js";
import { viewDecorations } from "../decorations/viewDecorations.js";
import { UseEditorOptions, useEditor } from "../hooks/useEditor.js";

import {
  EditorStateSelectorsProvider,
  EditorStateSelectorsRegistrar,
} from "./EditorStateSelectorsProvider.js";
import { LayoutGroup } from "./LayoutGroup.js";
import { DocNodeViewContext } from "./ProseMirrorDoc.js";
import { MarkViewComponentProps } from "./marks/MarkViewComponentProps.js";
import { NodeViewComponentProps } from "./nodes/NodeViewComponentProps.js";

function getPos() {
  return -1;
}

const rootChildDescriptionsContextValue = {
  parentRef: { current: undefined },
  siblingsRef: {
    current: [],
  },
} satisfies ChildDescriptionsContextValue;

export type Props = UseEditorOptions & {
  children?: ReactNode;
  nodeViewComponents?: {
    [nodeType: string]: ComponentType<NodeViewComponentProps>;
  };
  markViewComponents?: {
    [markType: string]: ComponentType<MarkViewComponentProps>;
  };
};

function ProseMirrorInner({
  children,
  nodeViewComponents,
  markViewComponents,
  ...props
}: Props) {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  const { editor, state, renderStore } = useEditor(mount, props);

  const nodeViewConstructors = editor.view.nodeViews;
  const nodeViewContextValue = useMemo<NodeViewContextValue>(() => {
    return {
      components: { ...nodeViewComponents, ...markViewComponents },
      constructors: nodeViewConstructors,
    };
  }, [markViewComponents, nodeViewComponents, nodeViewConstructors]);

  const node = state.doc;
  const decorations = computeDocDeco(editor.view);
  const innerDecorations = viewDecorations(editor.view);
  const docNodeViewContextValue = useMemo(
    () => ({
      setMount,
      node,
      getPos,
      decorations,
      innerDecorations,
    }),
    [node, decorations, innerDecorations]
  );

  // An announced render keeps the previous context values: the consumers
  // re-render through the store in this pass anyway. The flag is consumed
  // here, so that a render the announcement did not cover (a transaction
  // dispatched from a layout effect, say) changes the contexts again.
  const contextValuesRef = useRef({ state, doc: docNodeViewContextValue });
  if (renderStore) {
    renderStore.state = state;
    renderStore.doc = docNodeViewContextValue;
    if (!renderStore.announced) {
      contextValuesRef.current = { state, doc: docNodeViewContextValue };
    }
    renderStore.announced = false;
  }
  const contextValues = renderStore
    ? contextValuesRef.current
    : { state, doc: docNodeViewContextValue };

  return (
    <EditorContext.Provider value={editor}>
      <RenderStoreContext.Provider value={renderStore}>
        <EditorStateContext.Provider value={contextValues.state}>
          <EditorStateSelectorsProvider>
            <NodeViewContext.Provider value={nodeViewContextValue}>
              <ChildDescriptionsContext.Provider
                value={rootChildDescriptionsContextValue}
              >
                <DocNodeViewContext.Provider value={contextValues.doc}>
                  {children}
                </DocNodeViewContext.Provider>
              </ChildDescriptionsContext.Provider>
            </NodeViewContext.Provider>
          </EditorStateSelectorsProvider>
        </EditorStateContext.Provider>
      </RenderStoreContext.Provider>
    </EditorContext.Provider>
  );
}

export function ProseMirror(props: Props) {
  return (
    <LayoutGroup>
      <EditorStateSelectorsRegistrar>
        <ProseMirrorInner {...props} />
      </EditorStateSelectorsRegistrar>
    </LayoutGroup>
  );
}
