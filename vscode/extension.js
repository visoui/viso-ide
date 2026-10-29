// The Viso extension: the `.vs` language, `view!("x.vs")` links and the DSL
// bodies in Rust, viso-lsp as the language server, and the Inspector, Events
// and Profile views over the CLI. Everything past highlighting comes from the
// server or the CLI; the extension adds no analysis of its own.

const path = require("path");
const vscode = require("vscode");
const { LanguageClient, TransportKind } = require("vscode-languageclient/node");
const embedded = require("./embedded");
const inspect = require("./inspect");

let client;

/** The command that runs the server: the configured path, else `viso lsp`. */
function serverCommand() {
  const configured = vscode.workspace.getConfiguration("viso").get("server.path");
  if (configured) {
    return { command: configured, args: ["--stdio"] };
  }
  return { command: "viso", args: ["lsp", "--stdio"] };
}

/** Stops the current client, whatever state it reached. */
async function stopClient() {
  const stopping = client;
  client = undefined;
  if (stopping) {
    // A client that never started has nothing to stop; it rejects saying so.
    await stopping.stop().catch(() => {});
  }
}

function startClient() {
  const run = { ...serverCommand(), transport: TransportKind.stdio };
  client = new LanguageClient(
    "viso",
    "Viso",
    { run, debug: run },
    {
      documentSelector: [{ language: "viso" }],
      synchronize: { fileEvents: vscode.workspace.createFileSystemWatcher("**/*.vs") },
      middleware: {
        // A Rust body's mirror is checked by rustc through the macro; its
        // diagnostics would only repeat those, at the mirror's positions.
        handleDiagnostics(uri, diagnostics, next) {
          if (uri.scheme !== embedded.SCHEME) {
            next(uri, diagnostics);
          }
        },
      },
    },
  );
  // A server that cannot start leaves the highlighting and the links; the
  // message names the setting that points at another one.
  return client.start().catch((error) => {
    vscode.window.showErrorMessage(
      `Viso: viso-lsp did not start (${error.message}). Install it beside \`viso\`, or set \`viso.server.path\`.`,
    );
  });
}

/** The `.vs` file a `view!("…")` names, relative to the Rust file. */
const VIEW_CALL = /\bview!\s*\(\s*"((?:[^"\\]|\\.)*\.vs)"\s*\)/g;

const viewLinks = {
  provideDocumentLinks(document) {
    const text = document.getText();
    const links = [];
    for (const match of text.matchAll(VIEW_CALL)) {
      const start = match.index + match[0].indexOf('"') + 1;
      const range = new vscode.Range(
        document.positionAt(start),
        document.positionAt(start + match[1].length),
      );
      const target = vscode.Uri.file(path.join(path.dirname(document.uri.fsPath), match[1]));
      const link = new vscode.DocumentLink(range, target);
      link.tooltip = "Open the view";
      links.push(link);
    }
    return links;
  },
};

async function activate(context) {
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider({ language: "rust" }, viewLinks),
    vscode.commands.registerCommand("viso.restartServer", async () => {
      await stopClient();
      await startClient();
    }),
    { dispose: stopClient },
  );
  embedded.register(context);
  const views = inspect.register(context);
  await startClient();
  return { client: () => client, views };
}

function deactivate() {
  return stopClient();
}

module.exports = { activate, deactivate };
