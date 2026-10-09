import { Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import React, {
  ElementType,
  HTMLProps,
  createContext,
  forwardRef,
  useContext,
} from "react";

import { useRenderStore } from "../contexts/RenderStoreContext.js";

import { DocNodeView } from "./nodes/DocNodeView.js";

export interface DocNodeViewContextValue {
  node: Node;
  getPos: () => number;
  decorations: readonly Decoration[];
  innerDecorations: DecorationSource;
  setMount: (mount: HTMLElement | null) => void;
}

export const DocNodeViewContext = createContext<DocNodeViewContextValue>(
  null as unknown as DocNodeViewContextValue
);

interface Props extends Omit<HTMLProps<HTMLElement>, "as"> {
  as?: ElementType;
}

export const ProseMirrorDoc = forwardRef<HTMLElement, Props>(
  function ProseMirrorDoc({ as, ...props }, ref) {
    const docProps = useContext(DocNodeViewContext);
    const store = useRenderStore();
    return (
      <DocNodeView ref={ref} {...props} {...(store?.doc ?? docProps)} as={as} />
    );
  }
);
