// Inside VSCode: the fixture's diagnostics, hover, definition, semantic tokens,
// completion, formatting and `view!` links, each from viso-lsp or the extension.

const assert = require("assert");
const path = require("path");
const vscode = require("vscode");

const app = path.join(__dirname, "..", "..", "fixtures", "app", "src");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries `probe` until it returns a value, for up to `ms`. */
async function until(probe, ms = 20000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await probe();
    if (value) {
      return value;
    }
    if (Date.now() > end) {
      throw new Error(`timed out waiting for ${probe}`);
    }
    await sleep(200);
  }
}

async function open(name) {
  const document = await vscode.workspace.openTextDocument(path.join(app, name));
  await vscode.window.showTextDocument(document);
  return document;
}

/** The position of the `nth` occurrence of `word` in `document`. */
function at(document, word, nth = 0) {
  const text = document.getText();
  let index = -1;
  for (let i = 0; i <= nth; i++) {
    index = text.indexOf(word, index + 1);
  }
  assert.ok(index >= 0, `no \`${word}\``);
  return document.positionAt(index + 1);
}

async function run() {
  const extension = vscode.extensions.getExtension("viso.viso");
  await extension.activate();
  await vscode.workspace
    .getConfiguration("viso")
    .update("server.path", process.env.VISO_LSP, vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand("viso.restartServer");

  const broken = await open("broken.vs");
  assert.strictEqual(broken.languageId, "viso");
  const diagnostics = await until(() => {
    const found = vscode.languages.getDiagnostics(broken.uri);
    return found.length ? found : null;
  });
  assert.ok(
    diagnostics.some((d) => String(d.code && (d.code.value || d.code)) === "E2001"),
    JSON.stringify(diagnostics),
  );
  const hovers = await vscode.commands.executeCommand(
    "vscode.executeHoverProvider",
    broken.uri,
    at(broken, "missing"),
  );
  const hover = hovers
    .flatMap((h) => h.contents)
    .map((c) => c.value || String(c))
    .join("\n");
  assert.ok(hover.includes("E2001"), hover);

  const counter = await open("counter.vs");
  const targets = await vscode.commands.executeCommand(
    "vscode.executeDefinitionProvider",
    counter.uri,
    at(counter, "bump", 1),
  );
  assert.strictEqual(targets.length, 1);
  const target = targets[0].range || targets[0].targetSelectionRange || targets[0].targetRange;
  assert.strictEqual(target.start.line, at(counter, "bump").line);

  const legend = await vscode.commands.executeCommand(
    "vscode.provideDocumentSemanticTokensLegend",
    counter.uri,
  );
  const tokens = await until(() =>
    vscode.commands.executeCommand("vscode.provideDocumentSemanticTokens", counter.uri),
  );
  const classes = new Map();
  let line = 0;
  let character = 0;
  for (let i = 0; i < tokens.data.length; i += 5) {
    const [dLine, dStart, , type] = tokens.data.slice(i, i + 4);
    line += dLine;
    character = dLine ? dStart : character + dStart;
    classes.set(`${line}:${character}`, legend.tokenTypes[type]);
  }
  const classOf = (word, nth) => {
    const p = at(counter, word, nth).translate(0, -1);
    return classes.get(`${p.line}:${p.character}`);
  };
  assert.strictEqual(classOf("count", 2), "property");
  assert.strictEqual(classOf("Column"), "class");
  assert.strictEqual(classOf("click {"), "event");
  assert.strictEqual(classOf("view"), "keyword");

  const draft = await vscode.workspace.openTextDocument({
    language: "viso",
    content: "component D {\n    view { Button { on  } }\n}\n",
  });
  const complete = async (character) => {
    const list = await vscode.commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      draft.uri,
      new vscode.Position(1, character),
    );
    return list.items.map((item) => item.label.label || item.label);
  };
  const properties = await until(async () => {
    const labels = await complete(20);
    return labels.includes("text") ? labels : null;
  });
  assert.ok(properties.includes("Column"), properties.join(" "));
  const events = await complete(23);
  assert.ok(events.includes("click"), events.join(" "));

  const messy = await vscode.workspace.openTextDocument({
    language: "viso",
    content: "component M {\nstate n = 0;\n    view { Text { text: \"x\"; } }\n}\n",
  });
  const edits = await vscode.commands.executeCommand(
    "vscode.executeFormatDocumentProvider",
    messy.uri,
    { tabSize: 4, insertSpaces: true },
  );
  assert.ok(edits && edits.length > 0, "formatting edits");
  const formatted = new vscode.WorkspaceEdit();
  formatted.set(messy.uri, edits);
  await vscode.workspace.applyEdit(formatted);
  assert.ok(messy.getText().includes("\n    state n = 0;\n"), messy.getText());

  const main = await open("main.rs");
  const links = await vscode.commands.executeCommand("vscode.executeLinkProvider", main.uri);
  assert.ok(
    links.some((l) => l.target && l.target.fsPath === path.join(app, "counter.vs")),
    JSON.stringify(links),
  );
}

module.exports = {
  run: () =>
    run().then(
      () => console.log("integration: passed"),
      (error) => {
        console.error(`integration: ${error.stack || error}`);
        throw error;
      },
    ),
};
