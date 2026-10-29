// The DSL bodies of a Rust file and their mirrors: where each `ui!` and
// `component!` body is, the `.vs` text that stands for it, and the position
// mapping between the two. Pure: no `vscode` here.
//
// A mirror keeps every body line where it is relative to the body's first line
// and every column where it is, so mapping is a line shift. `ui!` holds one
// node, so its mirror wraps it in a component's view; `component!` may leave
// out the `component` keyword, which its mirror writes in.

const OPEN = { "{": "}", "(": ")", "[": "]" };
const CALL = /\b(ui|component)!\s*([{(\[])/g;
const UI_HEAD = "component Ui { view {\n";
const UI_TAIL = "\n} }\n";
const KEYWORD = "component ";

/** The offset just past the delimiter that closes the one opening at `open`. */
function close(text, open) {
  const opener = text[open];
  const closer = OPEN[opener];
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === "\\") {
          i++;
        }
      }
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        i++;
      }
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (c === opener) {
      depth++;
    } else if (c === closer && --depth === 0) {
      return i;
    }
  }
  return -1;
}

/** Line and UTF-16 column of `offset` in `text`. */
function position(text, offset) {
  let line = 0;
  let start = 0;
  for (let i = text.indexOf("\n"); i >= 0 && i < offset; i = text.indexOf("\n", i + 1)) {
    line++;
    start = i + 1;
  }
  return { line, character: offset - start };
}

/** Where a `component!` body names its component without the keyword: the
 * offset in the body to write `component ` at, or -1. */
function missingKeyword(body) {
  const name = /\b([A-Za-z_]\w*)\s*[{<]/g;
  let match;
  while ((match = name.exec(body))) {
    const before = body.slice(0, match.index);
    if (/\/\/[^\n]*$/.test(before)) {
      continue;
    }
    return /\bcomponent\s+$/.test(before) ? -1 : match.index;
  }
  return -1;
}

/**
 * Every DSL body of `text`: `{kind, start, end, mirror, line, character,
 * insert}` with `start`/`end` the body's offsets, `line`/`character` where it
 * begins and `insert` the body offset the keyword was written at (-1: none).
 */
function find(text) {
  const found = [];
  CALL.lastIndex = 0;
  let match;
  while ((match = CALL.exec(text))) {
    const open = match.index + match[0].length - 1;
    const end = close(text, open);
    if (end < 0) {
      break;
    }
    const start = open + 1;
    const body = text.slice(start, end);
    const at = position(text, start);
    const pad = " ".repeat(at.character);
    let mirror;
    let insert = -1;
    if (match[1] === "ui") {
      mirror = `${UI_HEAD}${pad}${body}${UI_TAIL}`;
    } else {
      insert = missingKeyword(body);
      const written = insert < 0 ? body : body.slice(0, insert) + KEYWORD + body.slice(insert);
      mirror = `\n${pad}${written}\n`;
    }
    found.push({ kind: match[1], start, end, mirror, ...at, insert });
    CALL.lastIndex = end;
  }
  return found;
}

/** The position mapping between `text` and `region`'s mirror. */
function mapping(text, region) {
  const inserted =
    region.insert < 0 ? undefined : position(text, region.start + region.insert);
  return {
    toMirror(p) {
      let character = p.character;
      if (inserted && p.line === inserted.line && character >= inserted.character) {
        character += KEYWORD.length;
      }
      return { line: p.line - region.line + 1, character };
    },
    toSource(p) {
      const line = p.line + region.line - 1;
      let character = p.character;
      if (inserted && line === inserted.line && character >= inserted.character) {
        character = Math.max(inserted.character, character - KEYWORD.length);
      }
      return { line, character };
    },
  };
}

module.exports = { find, mapping };
