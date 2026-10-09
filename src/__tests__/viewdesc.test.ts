import {
  TrailingHackViewDesc,
  ViewDesc,
  placeViewDesc,
  sortViewDescs,
} from "../viewdesc.js";

// Seeded so that a failing sequence can be replayed.
const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe("placeViewDesc", () => {
  it("keeps random mount, move and unmount sequences in full-sort order", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const random = mulberry32(seed);
      const below = (n: number) => Math.floor(random() * n);
      const parent = document.createElement("p");
      const positions = new Map<ViewDesc, number>();
      const labels = new Map<ViewDesc, string>();
      const label = (desc: ViewDesc) => labels.get(desc);
      const siblings: ViewDesc[] = [];

      const mount = (desc: ViewDesc, position: number) => {
        positions.set(desc, position);
        labels.set(desc, `${labels.size}@${position}`);
        placeViewDesc(siblings, desc);
      };

      // With one trailing hack the comparator is a total order, so a full
      // sort has exactly one answer.
      if (seed % 2) {
        const br = document.createElement("br");
        parent.append(br);
        mount(new TrailingHackViewDesc(undefined, [], () => 0, br, null), 0);
      }

      for (let step = 0; step < 200; step++) {
        const movable = siblings.filter(
          (desc) => !(desc instanceof TrailingHackViewDesc)
        );
        const target = movable[below(movable.length)];
        const action = random();

        if (!target || action < 0.4) {
          // Shared positions are frequent, so DOM order breaks many ties.
          const dom = document.createElement("span");
          parent.insertBefore(
            dom,
            parent.childNodes[below(parent.childNodes.length + 1)] ?? null
          );
          const desc: ViewDesc = new ViewDesc(
            undefined,
            [],
            () => positions.get(desc) ?? 0,
            dom,
            null
          );
          mount(desc, below(20));
        } else if (action < 0.7) {
          positions.set(target, below(20));
          placeViewDesc(siblings, target);
        } else if (action < 0.9) {
          siblings.splice(siblings.indexOf(target), 1);
          target.dom.parentNode?.removeChild(target.dom);
        } else {
          placeViewDesc(siblings, target);
        }

        expect(siblings.map(label)).toEqual(
          [...siblings].sort(sortViewDescs).map(label)
        );
      }
    }
  });

  // A textblock ending in an inline non-editable node gets a separator img
  // and a trailing br, both TrailingHackViewDescs. sortViewDescs says "after"
  // for either one, so between the two the last one placed goes first.
  describe("two trailing hacks", () => {
    const setup = () => {
      const parent = document.createElement("p");
      const text = document.createElement("span");
      const img = document.createElement("img");
      const br = document.createElement("br");
      parent.append(text, img, br);
      const descs = {
        text: new ViewDesc(undefined, [], () => 1, text, null),
        img: new TrailingHackViewDesc(undefined, [], () => 2, img, null),
        br: new TrailingHackViewDesc(undefined, [], () => 2, br, null),
      };
      const label = (desc: ViewDesc) =>
        Object.entries(descs).find(([, value]) => value === desc)?.[0];
      return { descs, label };
    };

    it("are in DOM order on mount, where the full sort is not", () => {
      const { descs, label } = setup();
      const siblings: ViewDesc[] = [];

      // The separator registers after its own re-render, so after the br.
      placeViewDesc(siblings, descs.text);
      placeViewDesc(siblings, descs.br);
      placeViewDesc(siblings, descs.img);

      expect(siblings.map(label)).toEqual(["text", "img", "br"]);
      expect(
        [descs.text, descs.br, descs.img].sort(sortViewDescs).map(label)
      ).toEqual(["text", "br", "img"]);
    });

    it("match the full sort once both re-render", () => {
      const { descs, label } = setup();
      const siblings: ViewDesc[] = [descs.text, descs.img, descs.br];

      placeViewDesc(siblings, descs.img);
      placeViewDesc(siblings, descs.br);

      expect(siblings.map(label)).toEqual(["text", "br", "img"]);
      expect([...siblings].sort(sortViewDescs).map(label)).toEqual([
        "text",
        "br",
        "img",
      ]);
    });
  });
});
