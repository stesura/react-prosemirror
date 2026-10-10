import { Mark, Node } from "prosemirror-model";
import { Decoration, DecorationSource } from "prosemirror-view";
import React, {
  ComponentType,
  ReactNode,
  cloneElement,
  createElement,
  memo,
  useCallback,
  useContext,
  useRef,
} from "react";

import { ChildDescriptionsContext } from "../contexts/ChildDescriptionsContext.js";
import { EditorContext } from "../contexts/EditorContext.js";
import { ReactWidgetDecoration } from "../decorations/ReactWidgetType.js";
import { InternalDecorationSource } from "../decorations/internalTypes.js";
import { iterDeco } from "../decorations/iterDeco.js";
import { reactKeysPluginKey } from "../plugins/reactKeys.js";
import { htmlAttrsToReactProps, mergeReactProps } from "../props.js";
import { sameOuterDeco } from "../viewdesc.js";

import { NativeWidgetView } from "./NativeWidgetView.js";
import { SeparatorHackView } from "./SeparatorHackView.js";
import { TextNodeView } from "./TextNodeView.js";
import { TrailingHackView } from "./TrailingHackView.js";
import { WidgetView } from "./WidgetView.js";
import { MarkView } from "./marks/MarkView.js";
import { RemountableNodeView } from "./nodes/NodeView.js";

export function wrapInDeco(reactNode: JSX.Element | string, deco: Decoration) {
  const {
    nodeName,
    ...attrs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = (deco as any).type.attrs;

  const props = htmlAttrsToReactProps(attrs);

  // We auto-wrap text nodes in spans so that we can apply attributes
  // and styles, but we want to avoid double-wrapping the same
  // text node
  if (nodeName || typeof reactNode === "string") {
    return createElement(nodeName ?? "span", props, reactNode);
  }

  return cloneElement(reactNode, mergeReactProps(reactNode.props, props));
}

function areChildrenEqual(a: Child, b: Child) {
  return (
    a.type === b.type &&
    a.marks.every((mark) => mark.isInSet(b.marks)) &&
    b.marks.every((mark) => mark.isInSet(a.marks)) &&
    a.key === b.key &&
    (a.type !== "node" ||
      b.type !== "node" ||
      (a.node.eq(b.node) &&
        sameOuterDeco(a.outerDeco, b.outerDeco) &&
        (a.innerDeco as InternalDecorationSource).eq(b.innerDeco))) &&
    (a as ChildWidget).widget === (b as ChildWidget).widget
  );
}

type ChildWidget = {
  type: "widget";
  widget: ReactWidgetDecoration;
  marks: readonly Mark[];
  offset: number;
  index: number;
  key: string;
};

type ChildNativeWidget = {
  type: "native-widget";
  widget: Decoration;
  marks: readonly Mark[];
  offset: number;
  index: number;
  key: string;
};

type ChildNode = {
  type: "node";
  node: Node;
  marks: readonly Mark[];
  innerDeco: DecorationSource;
  outerDeco: readonly Decoration[];
  offset: number;
  index: number;
  key: string;
};

type ChildHack = {
  type: "hack";
  component: ComponentType<{ getPos: () => number }>;
  marks: readonly Mark[];
  offset: number;
  index: number;
  key: string;
};

type Child = ChildNode | ChildWidget | ChildNativeWidget | ChildHack;

/**
 * A child list with the marks each child had when it was rendered. Child
 * objects are reused across renders while equal, but a widget's marks are
 * reassigned in place when its neighbours change, so identity alone does
 * not prove a list is unchanged.
 */
type Snapshot = {
  children: Child[];
  marks: Array<readonly Mark[]>;
};

const snapshot = (children: Child[]): Snapshot => ({
  children,
  marks: children.map((child) => child.marks),
});

const sameChildren = (prev: Snapshot, next: Child[]) =>
  prev.children.length === next.length &&
  next.every(
    (child, i) => prev.children[i] === child && prev.marks[i] === child.marks
  );

/** The previous list when nothing in it changed, so memoised views bail out. */
const reuseChildren = (
  ref: { current: Snapshot | null },
  next: Child[]
): Child[] => {
  const prev = ref.current;
  if (prev && sameChildren(prev, next)) return prev.children;
  ref.current = snapshot(next);
  return next;
};

type SharedMarksProps = {
  getInnerPos: () => number;
  childViews: Child[];
  /** Marks below this index are rendered by enclosing `MarkView`s. */
  depth: number;
};

const ChildView = memo(function ChildView({
  child,
  getInnerPos,
}: {
  child: Child;
  getInnerPos: () => number;
}) {
  const { view } = useContext(EditorContext);

  const childRef = useRef<Child>(child);
  childRef.current = child;

  const getPos = useCallback(() => {
    return getInnerPos() + childRef.current.offset;
  }, [getInnerPos]);

  return child.type === "widget" ? (
    <WidgetView
      key={child.key}
      widget={child.widget as unknown as ReactWidgetDecoration}
      getPos={getPos}
    />
  ) : child.type === "native-widget" ? (
    <NativeWidgetView key={child.key} widget={child.widget} getPos={getPos} />
  ) : child.type === "hack" ? (
    <child.component key={child.key} getPos={getPos} />
  ) : child.node.isText ? (
    <ChildDescriptionsContext.Consumer key={child.key}>
      {({ siblingsRef, parentRef }) => (
        <TextNodeView
          view={view}
          node={child.node}
          getPos={getPos}
          siblingsRef={siblingsRef}
          parentRef={parentRef}
          decorations={child.outerDeco}
        />
      )}
    </ChildDescriptionsContext.Consumer>
  ) : (
    <RemountableNodeView
      key={child.key}
      node={child.node}
      getPos={getPos}
      outerDeco={child.outerDeco}
      innerDeco={child.innerDeco}
    />
  );
});

const InlinePartition = memo(function InlinePartition({
  childViews,
  getInnerPos,
  depth,
}: {
  childViews: [Child, ...Child[]];
  getInnerPos: () => number;
  depth: number;
}) {
  const firstChild = childViews[0];
  const firstChildRef = useRef(firstChild);
  firstChildRef.current = firstChild;

  const getPos = useCallback(() => {
    return getInnerPos() + firstChildRef.current.offset;
  }, [getInnerPos]);

  const firstMark = firstChild.marks[depth];
  if (!firstMark) {
    return (
      <>
        {childViews.map((child) => {
          return (
            <ChildView
              key={child.key}
              child={child}
              getInnerPos={getInnerPos}
            />
          );
        })}
      </>
    );
  }

  return (
    <MarkView key={firstChild.key} mark={firstMark} getPos={getPos} inline>
      <InlineView
        key={firstChild.key}
        getInnerPos={getInnerPos}
        childViews={childViews}
        depth={depth + 1}
      />
    </MarkView>
  );
});

const partitionByMark = (childViews: Child[], depth: number) => {
  const partitions: Array<[Child, ...Child[]]> = [];
  for (const child of childViews) {
    const last = partitions[partitions.length - 1];
    const lastMark = last?.[last.length - 1]?.marks[depth];
    const mark = child.marks[depth];
    if (last && (mark ? lastMark && mark.eq(lastMark) : !lastMark)) {
      last.push(child);
    } else {
      partitions.push([child]);
    }
  }
  return partitions;
};

const InlineView = memo(function InlineView({
  getInnerPos,
  childViews,
  depth,
}: SharedMarksProps) {
  // Partitions keep their array identity while their children are unchanged,
  // so `InlinePartition` only re-renders the run that actually changed.
  const cache = useRef(new Map<string, Snapshot>());
  const next = new Map<string, Snapshot>();
  const partitioned = partitionByMark(childViews, depth).map((partition) => {
    const ref = { current: cache.current.get(partition[0].key) ?? null };
    const children = reuseChildren(ref, partition);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    next.set(partition[0].key, ref.current!);
    return children;
  });
  cache.current = next;

  return (
    <>
      {partitioned.map((childViews) => {
        const firstChild = childViews[0];
        if (!firstChild) return null;
        return (
          <InlinePartition
            key={firstChild.key}
            childViews={childViews as [Child, ...Child[]]}
            getInnerPos={getInnerPos}
            depth={depth}
          />
        );
      })}
    </>
  );
});

function createKey(
  innerPos: number,
  offset: number,
  index: number,
  type: Child["type"],
  posToKey: Map<number, string> | undefined,
  widget?: ReactWidgetDecoration | Decoration
) {
  const pos = innerPos + offset;
  const key = posToKey?.get(pos);

  if (type === "widget" || type === "native-widget") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((widget as any).type.spec.key)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (widget as any).type.spec.key;

    if (type === "widget") {
      // eslint-disable-next-line no-console
      console.warn(
        `Widget at position ${pos} doesn't have a key specified. React ProseMirror will generate a key partially based on this widget’s index into its parent’s children. This can cause issues if there are multiple adjacent widgets.`
      );
    }
    return `${key}-${index}`;
  }

  if (key) return key;

  // if (!doc) return pos;

  const parentPos = innerPos - 1;

  const parentKey = posToKey?.get(parentPos);

  if (parentKey) return `${parentKey}-${offset}`;

  return pos;
}

function adjustWidgetMarksForward(
  lastNodeChild: ChildNode | null,
  widgetChild: ChildWidget | ChildNativeWidget | null
) {
  if (
    !widgetChild ||
    // Using internal Decoration property, "type"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (widgetChild.widget as any).type.side >= 0
  )
    return;

  if (!lastNodeChild || !lastNodeChild.node.isInline) return;

  const marksToSpread = lastNodeChild.marks;

  const marks = widgetChild.marks.reduce(
    (acc, mark) => mark.addToSet(acc),
    marksToSpread
  );
  if (!Mark.sameSet(marks, widgetChild.marks)) widgetChild.marks = marks;
}

function adjustWidgetMarksBack(
  widgetChildren: Array<ChildNativeWidget | ChildWidget>,
  nodeChild: ChildNode
) {
  if (!nodeChild.node.isInline) return;

  const marksToSpread = nodeChild.marks;
  for (let i = widgetChildren.length - 1; i >= 0; i--) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const child = widgetChildren[i]!;

    if (
      // Using internal Decoration property, "type"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (child.widget as any).type.side < 0 ||
      // Using internal Decoration property, "type"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (child.widget as any).type.spec.marks
    ) {
      continue;
    }

    const marks = child.marks.reduce(
      (acc, mark) => mark.addToSet(acc),
      marksToSpread
    );
    if (!Mark.sameSet(marks, child.marks)) child.marks = marks;
  }
}

const ChildElement = memo(
  function ChildElement({
    child,
    getInnerPos,
  }: {
    child: Child;
    getInnerPos: () => number;
  }) {
    const childRef = useRef<Child>(child);
    childRef.current = child;

    const getPos = useCallback(() => {
      return getInnerPos() + childRef.current.offset;
    }, [getInnerPos]);

    if (child.type === "node") {
      return child.marks.reduce(
        (element, mark) => (
          <MarkView mark={mark} getPos={getPos} inline={false}>
            {element}
          </MarkView>
        ),
        <RemountableNodeView
          key={child.key}
          outerDeco={child.outerDeco}
          node={child.node}
          innerDeco={child.innerDeco}
          getPos={getPos}
        />
      );
    } else {
      return (
        <InlineView
          key={child.key}
          childViews={[child]}
          getInnerPos={getInnerPos}
          depth={0}
        />
      );
    }
  }
  /**
   * It's safe to skip re-rendering a ChildElement component as long
   * as its child prop is shallowly equivalent to the previous render.
   * posToKey will be updated on every doc update, but if the child
   * hasn't changed, it will still have the same key.
   */
  // (prevProps, nextProps) => areChildrenEqual(prevProps.child, nextProps.child)
);

function createChildElements(
  children: Child[],
  getInnerPos: () => number
): ReactNode[] {
  if (!children.length) return [];

  if (children.every((child) => child.type !== "node" || child.node.isInline)) {
    return [
      <InlineView
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        key={children[0]!.key}
        childViews={children}
        getInnerPos={getInnerPos}
        depth={0}
      />,
    ];
  }

  return children.map((child) => {
    return (
      <ChildElement key={child.key} child={child} getInnerPos={getInnerPos} />
    );
  });
}

export const ChildNodeViews = memo(function ChildNodeViews({
  getPos,
  node,
  innerDecorations,
}: {
  getPos: () => number;
  node: Node | undefined;
  innerDecorations: DecorationSource;
}) {
  const { view } = useContext(EditorContext);

  const getInnerPos = useCallback(() => getPos() + 1, [getPos]);

  const childMap = useRef(new Map<string, Child>()).current;
  const hacks = useRef<[ChildHack, ChildHack] | null>(null);
  const childrenSnapshot = useRef<Snapshot | null>(null);

  if (!node) return null;

  const keysSeen = new Map<string, number>();

  let widgetChildren: Array<ChildNativeWidget | ChildWidget> = [];
  let lastNodeChild: ChildNode | null = null;

  iterDeco(
    node,
    innerDecorations,
    (widget, isNative, offset, index) => {
      const posToKey = reactKeysPluginKey.getState(view.state)?.posToKey;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const widgetMarks = ((widget as any).type.spec.marks as Mark[]) ?? [];
      let key;
      if (isNative) {
        key = createKey(
          getInnerPos(),
          offset,
          index,
          "native-widget",
          posToKey,
          widget
        );
        const child = {
          type: "native-widget",
          widget,
          marks: widgetMarks,
          offset,
          index,
          key,
        } as const;
        const prevChild = childMap.get(key);
        if (prevChild && areChildrenEqual(prevChild, child)) {
          prevChild.offset = offset;
        } else {
          childMap.set(key, child);
        }
        keysSeen.set(key, keysSeen.size);
      } else {
        key = createKey(
          getInnerPos(),
          offset,
          index,
          "widget",
          posToKey,
          widget
        );
        const child = {
          type: "widget",
          widget: widget as ReactWidgetDecoration,
          marks: widgetMarks,
          offset,
          index,
          key,
        } as const;
        const prevChild = childMap.get(key);
        if (prevChild && areChildrenEqual(prevChild, child)) {
          prevChild.offset = offset;
        } else {
          childMap.set(key, child);
        }
        keysSeen.set(key, keysSeen.size);
      }
      const child = childMap.get(key) as ChildWidget | ChildNativeWidget;
      widgetChildren.push(child);
      adjustWidgetMarksForward(
        lastNodeChild,
        childMap.get(key) as ChildWidget | ChildNativeWidget
      );
    },
    (childNode, outerDeco, innerDeco, offset, index) => {
      const posToKey = reactKeysPluginKey.getState(view.state)?.posToKey;
      const key = createKey(getInnerPos(), offset, index, "node", posToKey);
      const child = {
        type: "node",
        node: childNode,
        marks: childNode.marks,
        innerDeco,
        outerDeco,
        offset,
        index,
        key,
      } as const;
      const prevChild = childMap.get(key);
      if (prevChild && areChildrenEqual(prevChild, child)) {
        prevChild.offset = offset;
        lastNodeChild = prevChild as ChildNode;
      } else {
        childMap.set(key, child);
        lastNodeChild = child;
      }
      keysSeen.set(key, keysSeen.size);
      adjustWidgetMarksBack(widgetChildren, lastNodeChild);
      widgetChildren = [];
    }
  );

  for (const key of childMap.keys()) {
    if (!keysSeen.has(key)) {
      childMap.delete(key);
    }
  }

  const built = Array.from(childMap.values()).sort(
    // We already ensured that these existed in keysSeen in the previous
    // step
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (a, b) => keysSeen.get(a.key)! - keysSeen.get(b.key)!
  );

  if (node.isTextblock) {
    const lastChild = built[built.length - 1];

    if (
      !lastChild ||
      lastChild.type !== "node" ||
      (lastChild.node.isInline && !lastChild.node.isText) ||
      // RegExp.test actually handles undefined just fine
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      /\n$/.test(lastChild.node.text!)
    ) {
      hacks.current ??= [
        {
          type: "hack",
          component: SeparatorHackView,
          marks: [],
          offset: 0,
          index: 0,
          key: "trailing-hack-img",
        },
        {
          type: "hack",
          component: TrailingHackView,
          marks: [],
          offset: 0,
          index: 0,
          key: "trailing-hack-br",
        },
      ];
      hacks.current.forEach((hack, i) => {
        hack.offset = lastChild?.offset ?? 0;
        hack.index = (lastChild?.index ?? 0) + i + 1;
      });
      built.push(...hacks.current);
    }
  }

  const children = reuseChildren(childrenSnapshot, built);
  const childElements = createChildElements(children, getInnerPos);

  return <>{childElements}</>;
});
