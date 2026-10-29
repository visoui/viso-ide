// The stream reading and the Rust-body mirrors, in node: no VSCode needed.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const stream = require("../stream");
const regions = require("../regions");

let checks = 0;
function check(name, body) {
  try {
    body();
    checks++;
  } catch (error) {
    console.error(`units: ${name}: ${error.stack}`);
    process.exitCode = 1;
  }
}

check("lines are split across chunks and non-events kept apart", () => {
  const events = [];
  const text = [];
  const reader = stream.lines((e) => events.push(e), (t) => text.push(t));
  reader.push('{"schema":"viso.cli.event","type":"progress","pay');
  reader.push('load":{"message":"a"}}\npanicked at x\n{"schema":"viso.cli.event","type":"summary"}');
  reader.end();
  assert.deepStrictEqual(
    events.map((e) => e.type),
    ["progress", "summary"],
  );
  assert.deepStrictEqual(text, ["panicked at x"]);
});

check("an inspect tree result nests its nodes and names their source", () => {
  const line = fs.readFileSync(path.join(__dirname, "fixtures", "inspect-tree.jsonl"), "utf8");
  const [window] = stream.tree(JSON.parse(line).payload);
  assert.strictEqual(window.count, 17);
  assert.strictEqual(window.roots.length, 1);
  const all = [];
  const walk = (n) => {
    all.push(n);
    n.children.forEach(walk);
  };
  window.roots.forEach(walk);
  assert.strictEqual(all.length, 17);
  const column = all.find((n) => n.type === "Column");
  assert.strictEqual(stream.nodeLabel(column), "Column");
  assert.deepStrictEqual(stream.spanStart(column.source_span), { line: 6, character: 8 });
  assert.ok(column.children.some((c) => c.type === "Button"));
  const root = window.roots[0];
  assert.strictEqual(stream.nodeLabel(root), "container");
  assert.strictEqual(stream.nodeDescription(root), "1280×720 @ 0,0  group");
});

check("events read as rows, a state change with its declaration", () => {
  const dirty = stream.eventRow({
    kind: "dirty",
    seq: 14,
    frame: 4,
    node: { node_id: "5:0", label: "Text#count" },
    classes: ["measure", "paint"],
    cause: {
      kind: "state",
      state: "taps",
      value: "2",
      declared: { file: "src/app.vs", line: 2, column_utf16: 5 },
    },
  });
  assert.strictEqual(dirty.label, "Text#count  measure, paint");
  assert.strictEqual(dirty.description, "#14 f4  ← state taps = 2");
  assert.deepStrictEqual(stream.spanEnd(dirty.source), { line: 1, character: 4 });
  const input = stream.eventRow({
    kind: "input",
    seq: 12,
    frame: 3,
    input: "pointer_down",
    at: [60, 20],
    target: { node_id: "6:0", label: "Button#tap" },
  });
  assert.strictEqual(input.label, "pointer_down (60, 20) → Button#tap");
  assert.strictEqual(stream.eventRow({ kind: "later" }), null);
});

check("profile metrics read as rows", () => {
  const rows = stream.profileRows({
    metrics: { frame: { p50: 8.29, p95: 8.97, max: 11.2 }, draw_calls: { p50: 3, p95: 3, max: 3 } },
  });
  assert.deepStrictEqual(rows[0], { name: "frame", description: "p50 8.29  p95 8.97  max 11.2" });
  assert.strictEqual(rows.length, 2);
});

const RUST = [
  "fn main() {",
  '    let a = viso::ui! { Text { text: "{n}"; } };',
  "    let b = viso::component! {",
  "        // Badge { not this one",
  "        Badge {",
  "            state on = false;",
  "        }",
  "    };",
  "}",
].join("\n");

check("each body is found, strings and comments skipped", () => {
  const found = regions.find(RUST);
  assert.deepStrictEqual(
    found.map((r) => r.kind),
    ["ui", "component"],
  );
  assert.strictEqual(RUST.slice(found[0].start, found[0].end), ' Text { text: "{n}"; } ');
  assert.ok(RUST.slice(found[1].start, found[1].end).trim().endsWith("}"));
});

check("a ui! mirror wraps its node and keeps its columns", () => {
  const [ui] = regions.find(RUST);
  const lines = ui.mirror.split("\n");
  assert.strictEqual(lines[0], "component Ui { view {");
  assert.strictEqual(lines[1], `${" ".repeat(23)} Text { text: "{n}"; } `);
  const map = regions.mapping(RUST, ui);
  const text = { line: 1, character: 24 };
  assert.deepStrictEqual(map.toMirror(text), { line: 1, character: 24 });
  assert.strictEqual(lines[1].slice(24, 28), "Text");
  assert.deepStrictEqual(map.toSource(map.toMirror(text)), text);
});

check("a component! mirror writes the keyword it leaves out", () => {
  const component = regions.find(RUST)[1];
  const lines = component.mirror.split("\n");
  // The body begins on line 2 of the source; its line 4 is mirror line 3.
  assert.strictEqual(lines[3], "        component Badge {");
  assert.strictEqual(lines[4], "            state on = false;");
  const map = regions.mapping(RUST, component);
  assert.deepStrictEqual(map.toMirror({ line: 4, character: 8 }), { line: 3, character: 18 });
  assert.deepStrictEqual(map.toMirror({ line: 5, character: 12 }), { line: 4, character: 12 });
  assert.deepStrictEqual(map.toSource({ line: 3, character: 18 }), { line: 4, character: 8 });
  const keyed = regions.find("component! { component A { view { Text {} } } }")[0];
  assert.strictEqual(keyed.insert, -1);
});

if (!process.exitCode) {
  console.log(`units: ${checks} checks passed`);
}
