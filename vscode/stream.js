// The CLI's `--json` event stream, read as the inspector and profile views
// show it. Pure: no `vscode` here, so the reading is testable in node.

/**
 * Splits a byte stream into JSON Lines events. `push` takes each chunk as it
 * arrives and calls `onEvent` once per complete line that is a CLI event;
 * other lines (a crash's text, say) go to `onText`.
 */
function lines(onEvent, onText = () => {}) {
  let pending = "";
  const take = (line) => {
    if (!line.trim()) {
      return;
    }
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      onText(line);
      return;
    }
    if (event && event.schema === "viso.cli.event") {
      onEvent(event);
    } else {
      onText(line);
    }
  };
  return {
    push(chunk) {
      pending += chunk;
      let end;
      while ((end = pending.indexOf("\n")) >= 0) {
        take(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
    },
    end() {
      take(pending);
      pending = "";
    },
  };
}

/** A node's one-line name, `Button#save.Primary`, or its paint kind. */
function nodeLabel(node) {
  if (!node.type) {
    return node.kind || "node";
  }
  const styles = (node.styles || []).map((s) => `.${s}`).join("");
  return `${node.type}${node.name ? `#${node.name}` : ""}${styles}`;
}

/** What a node's row says after its name: its box and its semantics. */
function nodeDescription(node) {
  const parts = [];
  const b = node.bounds;
  if (b) {
    parts.push(`${round(b.width)}×${round(b.height)} @ ${round(b.x)},${round(b.y)}`);
  }
  const s = node.semantics;
  if (s && s.role) {
    parts.push(s.label ? `${s.role} "${s.label}"` : s.role);
  }
  if (node.shown === false) {
    parts.push("hidden");
  }
  if (node.focused) {
    parts.push("focused");
  }
  return parts.join("  ");
}

function round(n) {
  return Math.round(n * 10) / 10;
}

/**
 * The windows of an `inspect tree` result, each node with its `children`, in
 * the order the census gives them (preorder, so a parent precedes its
 * children).
 */
function tree(result) {
  return (result.windows || []).map((window) => {
    const byId = new Map();
    const roots = [];
    for (const node of window.nodes || []) {
      const entry = { ...node, children: [] };
      byId.set(node.node_id, entry);
      const parent = node.parent && byId.get(node.parent);
      (parent ? parent.children : roots).push(entry);
    }
    return { window: window.window, count: byId.size, roots };
  });
}

/** One `inspect` event as a row: a label, a description and its source. */
function eventRow(payload) {
  const head = `#${payload.seq} f${payload.frame}`;
  switch (payload.kind) {
    case "input": {
      const at = payload.at ? ` (${payload.at.map(round).join(", ")})` : "";
      const target = payload.target ? ` → ${payload.target.label}` : "";
      return { label: `${payload.input}${at}${target}`, description: head, kind: "input" };
    }
    case "focus": {
      const name = (n) => (n ? n.label : "none");
      return {
        label: `focus ${name(payload.from)} → ${name(payload.to)}`,
        description: head,
        kind: "focus",
      };
    }
    case "dirty": {
      const cause = payload.cause || {};
      let why = cause.kind || "";
      if (cause.state) {
        why = `state ${cause.state}${cause.value !== undefined ? ` = ${cause.value}` : ""}`;
      }
      return {
        label: `${payload.node ? payload.node.label : "node"}  ${(payload.classes || []).join(", ")}`,
        description: `${head}  ← ${why}`,
        kind: "dirty",
        source: cause.declared || null,
      };
    }
    case "dropped":
      return { label: `${payload.count} events dropped`, description: "", kind: "dropped" };
    case "attached":
      return {
        label: `attached: ${payload.windows} window(s), ${payload.nodes} nodes`,
        description: "",
        kind: "attached",
      };
    default:
      return null;
  }
}

/** A `profile` payload's metrics as rows, spans first in the CLI's order. */
function profileRows(payload) {
  const rows = [];
  for (const [name, m] of Object.entries(payload.metrics || {})) {
    rows.push({
      name,
      description: `p50 ${m.p50}  p95 ${m.p95}  max ${m.max}`,
    });
  }
  return rows;
}

/** A `source_span` (1-based line, UTF-16 column) as 0-based line and character. */
function spanStart(span) {
  return { line: span.line - 1, character: span.column_utf16 - 1 };
}

/** The `source_span`'s end as 0-based line and character; its start for a
 * location that names only a start (a state's `declared`). */
function spanEnd(span) {
  if (span.end_line === undefined) {
    return spanStart(span);
  }
  return { line: span.end_line - 1, character: span.end_column_utf16 - 1 };
}

module.exports = {
  lines,
  nodeLabel,
  nodeDescription,
  tree,
  eventRow,
  profileRows,
  spanStart,
  spanEnd,
};
