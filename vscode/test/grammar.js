// Tokenizes the fixtures with the extension's grammars, as VSCode does, and
// checks the scopes of the words that matter.

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const textmate = require("vscode-textmate");
const oniguruma = require("vscode-oniguruma");

const root = path.join(__dirname, "..");
const fixtures = path.join(root, "..", "fixtures", "app", "src");

const wasm = fs.readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")).buffer;
const onig = oniguruma.loadWASM(wasm).then(() => ({
  createOnigScanner: (sources) => new oniguruma.OnigScanner(sources),
  createOnigString: (text) => new oniguruma.OnigString(text),
}));

// A stand-in for VSCode's Rust grammar: all the injection needs is the scope.
const rust = {
  scopeName: "source.rust",
  patterns: [{ match: "\\b(fn|let)\\b", name: "keyword.other.rust" }],
};

const files = {
  "source.viso": path.join(root, "syntaxes", "viso.tmLanguage.json"),
  "source.rust.viso-injection": path.join(root, "syntaxes", "viso-rust.injection.json"),
};

const registry = new textmate.Registry({
  onigLib: onig,
  loadGrammar: async (scope) => {
    if (scope === "source.rust") {
      return textmate.parseRawGrammar(JSON.stringify(rust), "rust.json");
    }
    const file = files[scope];
    return file ? textmate.parseRawGrammar(fs.readFileSync(file, "utf8"), file) : null;
  },
  getInjections: (scope) => (scope === "source.rust" ? ["source.rust.viso-injection"] : []),
});

/** Each token of `text` as `[text, innermost scope, every scope]`. */
async function tokens(scope, text) {
  const grammar = await registry.loadGrammar(scope);
  let stack = textmate.INITIAL;
  const out = [];
  for (const line of text.split("\n")) {
    const result = grammar.tokenizeLine(line, stack);
    for (const token of result.tokens) {
      const word = line.slice(token.startIndex, token.endIndex);
      out.push([word, token.scopes[token.scopes.length - 1], token.scopes]);
    }
    stack = result.ruleStack;
  }
  return out;
}

/** The innermost scope of the `nth` token spelling `word`. */
function scopeOf(list, word, nth = 0) {
  const found = list.filter(([text]) => text.trim() === word);
  assert.ok(found.length > nth, `no token \`${word}\``);
  return found[nth][1];
}

async function main() {
  const vs = await tokens("source.viso", fs.readFileSync(path.join(fixtures, "counter.vs"), "utf8"));
  const expect = [
    ["//! A counter, the fixture every editor shell opens.", "comment.line.documentation.viso"],
    ["component", "keyword.declaration.viso"],
    ["Counter", "entity.name.type.viso"],
    ["input", "keyword.declaration.member.viso"],
    ["I32", "entity.name.type.viso"],
    ["state", "keyword.declaration.member.viso"],
    ["computed", "keyword.declaration.member.viso"],
    ["format", "entity.name.function.call.viso"],
    ["{n}", "meta.interpolation.viso"],
    ["action", "keyword.declaration.function.viso"],
    ["bump", "entity.name.function.viso"],
    ["view", "keyword.declaration.member.viso"],
    ["Column", "entity.name.tag.viso"],
    ["padding", "variable.other.property.viso"],
    ["16", "constant.numeric.viso"],
    ["dp", "keyword.other.unit.viso"],
    ["#1e88e5", "constant.other.color.viso"],
    ["on", "keyword.declaration.handler.viso"],
  ];
  for (const [word, scope] of expect) {
    assert.strictEqual(scopeOf(vs, word), scope, `\`${word}\``);
  }

  const rs = await tokens("source.rust", fs.readFileSync(path.join(fixtures, "main.rs"), "utf8"));
  // The `component!` body is Viso: its states and nodes read as the `.vs` do.
  assert.strictEqual(scopeOf(rs, "Badge"), "entity.name.tag.viso");
  assert.strictEqual(scopeOf(rs, "state"), "keyword.declaration.member.viso");
  assert.strictEqual(scopeOf(rs, "off"), "string.quoted.double.viso");
  const embedded = rs.find(([text]) => text.trim() === "Text")[2];
  assert.ok(embedded.includes("meta.embedded.block.viso"), embedded.join(" "));
  // Past the macro's closing brace the file is Rust again.
  const after = rs.find(([text]) => text.includes("viso::run("));
  assert.ok(after && !after[2].includes("meta.embedded.block.viso"), "Rust after the macro");
  console.log(`grammar: ${expect.length + 5} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
