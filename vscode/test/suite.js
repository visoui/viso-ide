// Inside VSCode: the fixture's diagnostics, hover, definition, formatting and
// `view!` links, each from viso-lsp or the extension.

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
