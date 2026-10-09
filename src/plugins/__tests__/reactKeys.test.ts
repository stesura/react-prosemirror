/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";

import { reactKeys, reactKeysPluginKey } from "../reactKeys.js";

const schema = new Schema({
  nodes: {
    doc: { content: "block+", attrs: { version: { default: 0 } } },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
    list: { group: "block", content: "list_item+" },
    list_item: { content: "inline*" },
    text: { group: "inline" },
  },
  marks: { strong: {} },
});

const keysOf = (state: EditorState) => {
  const keys = reactKeysPluginKey.getState(state);
  if (!keys) throw new Error("no reactKeys state");
  return keys;
};

describe("reactNodeViewPlugin", () => {
  it("should create a unique key for each node", () => {
    const editorState = EditorState.create({
      doc: schema.topNodeType.create(null, [
        schema.nodes.paragraph.create(),
        schema.nodes.paragraph.create(),
        schema.nodes.paragraph.create(),
      ]),
      plugins: [reactKeys()],
    });

    const pluginState = reactKeysPluginKey.getState(editorState)!;
    expect(pluginState.posToKey.size).toBe(3);
  });

  it("should maintain key stability when possible", () => {
    const initialEditorState = EditorState.create({
      doc: schema.topNodeType.create(null, [
        schema.nodes.paragraph.create({}, schema.text("Hello")),
        schema.nodes.paragraph.create(),
        schema.nodes.paragraph.create(),
      ]),
      plugins: [reactKeys()],
    });

    const initialPluginState = reactKeysPluginKey.getState(initialEditorState)!;

    const nextEditorState = initialEditorState.apply(
      initialEditorState.tr.insertText(", world!", 6)
    );
    const nextPluginState = reactKeysPluginKey.getState(nextEditorState)!;

    expect(Array.from(initialPluginState.keyToPos.keys())).toEqual(
      Array.from(nextPluginState.keyToPos.keys())
    );
  });

  it("should create unique keys for new nodes", () => {
    const initialEditorState = EditorState.create({
      doc: schema.topNodeType.create(null, [
        schema.nodes.paragraph.create(),
        schema.nodes.paragraph.create(),
        schema.nodes.paragraph.create(),
      ]),
      plugins: [reactKeys()],
    });

    const initialPluginState = reactKeysPluginKey.getState(initialEditorState)!;

    const nextEditorState = initialEditorState.apply(
      initialEditorState.tr.insert(0, schema.nodes.list.createAndFill()!)
    );
    const nextPluginState = reactKeysPluginKey.getState(nextEditorState)!;

    // Adds new keys for new nodes
    expect(nextPluginState.keyToPos.size).toBe(5);
    // Maintains keys for previous nodes that are still there
    Array.from(initialPluginState.keyToPos.keys()).forEach((key) => {
      expect(Array.from(nextPluginState.keyToPos.keys())).toContain(key);
    });
  });

  it("reuses the key tables when only attrs change", () => {
    const state = EditorState.create({
      doc: schema.topNodeType.create(null, [
        schema.nodes.paragraph.create(null, schema.text("Hello")),
        schema.nodes.paragraph.create(),
      ]),
      plugins: [reactKeys()],
    });
    const before = keysOf(state);

    const next = state.apply(
      state.tr
        .setNodeAttribute(0, "id", "a")
        .setNodeAttribute(7, "id", "b")
        .setDocAttribute("version", 1)
    );

    expect(next.doc.firstChild?.attrs["id"]).toBe("a");
    expect(keysOf(next).posToKey).toBe(before.posToKey);
    expect(keysOf(next).keyToPos).toBe(before.keyToPos);
  });

  it("gives keys to the text nodes a mark step splits off", () => {
    const state = EditorState.create({
      doc: schema.topNodeType.create(null, [
        schema.nodes.paragraph.create(null, schema.text("Hello")),
      ]),
      plugins: [reactKeys()],
    });
    const before = keysOf(state);

    const next = state.apply(
      state.tr
        .setNodeAttribute(0, "id", "a")
        .addMark(2, 4, schema.marks.strong.create())
    );

    expect(keysOf(next).posToKey).not.toBe(before.posToKey);
    expect(before.posToKey.has(2)).toBe(false);
    expect(keysOf(next).posToKey.has(2)).toBe(true);
    expect(keysOf(next).posToKey.has(4)).toBe(true);
    expect(keysOf(next).posToKey.get(0)).toBe(before.posToKey.get(0));
  });
});
