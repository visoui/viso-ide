// The DSL inside Rust: each `ui! { … }` and `component! { … }` body is
// mirrored into a `.vs` document of its own, which viso-lsp analyses like
// any other, and completion, hover and definition in the body are asked of
// that document and mapped back. Diagnostics are not mirrored: the macro
// reports the same ones through rustc.

const vscode = require("vscode");
const regions = require("./regions");

const SCHEME = "viso-embedded";

/** The mirror of `region` `index` of the Rust document `uri`. */
function mirrorUri(uri, index) {
  return vscode.Uri.from({ scheme: SCHEME, path: `${uri.fsPath}/embedded-${index}.vs` });
}

/** The Rust document a mirror mirrors, and the region's index. */
function sourceOf(mirror) {
  const match = /^(.*)\/embedded-(\d+)\.vs$/.exec(mirror.path);
  return match ? { uri: vscode.Uri.file(match[1]), index: Number(match[2]) } : undefined;
}

function register(context) {
  const changed = new vscode.EventEmitter();
  const provider = {
    onDidChange: changed.event,
    async provideTextDocumentContent(mirror) {
      const source = sourceOf(mirror);
      if (!source) {
        return "";
      }
      const document = await vscode.workspace.openTextDocument(source.uri);
      const region = regions.find(document.getText())[source.index];
      return region ? region.mirror : "";
    },
  };

  /** The region at `position` of `document`, its mirror open and current. */
  const at = async (document, position) => {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const found = regions.find(text);
    const index = found.findIndex((r) => offset >= r.start && offset <= r.end);
    if (index < 0) {
      return undefined;
    }
    const region = found[index];
    const uri = mirrorUri(document.uri, index);
    const mirror = await vscode.workspace.openTextDocument(uri);
    if (mirror.getText() !== region.mirror) {
      changed.fire(uri);
      await waitFor(() => mirror.getText() === region.mirror);
    }
    const map = regions.mapping(text, region);
    return {
      uri,
      position: toPosition(map.toMirror(position)),
      back: (range) =>
        new vscode.Range(
          toPosition(map.toSource(range.start)),
          toPosition(map.toSource(range.end)),
        ),
    };
  };

  const selector = { language: "rust" };
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider),
    vscode.languages.registerCompletionItemProvider(
      selector,
      {
        async provideCompletionItems(document, position) {
          const region = await at(document, position);
          if (!region) {
            return undefined;
          }
          const list = await vscode.commands.executeCommand(
            "vscode.executeCompletionItemProvider",
            region.uri,
            region.position,
          );
          // The ranges are the mirror's; the editor recomputes them here.
          const items = (list ? list.items : []).map((item) => {
            item.range = undefined;
            return item;
          });
          return new vscode.CompletionList(items, false);
        },
      },
      ":",
    ),
    vscode.languages.registerHoverProvider(selector, {
      async provideHover(document, position) {
        const region = await at(document, position);
        if (!region) {
          return undefined;
        }
        const hovers = await vscode.commands.executeCommand(
          "vscode.executeHoverProvider",
          region.uri,
          region.position,
        );
        const hover = hovers && hovers[0];
        return hover && new vscode.Hover(hover.contents, hover.range && region.back(hover.range));
      },
    }),
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position) {
        const region = await at(document, position);
        if (!region) {
          return undefined;
        }
        const targets = await vscode.commands.executeCommand(
          "vscode.executeDefinitionProvider",
          region.uri,
          region.position,
        );
        return (targets || [])
          .map((t) => ({ uri: t.uri || t.targetUri, range: t.range || t.targetSelectionRange }))
          .filter((t) => t.uri && t.uri.toString() === region.uri.toString())
          .map((t) => new vscode.Location(document.uri, region.back(t.range)));
      },
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId !== "rust") {
        return;
      }
      const count = regions.find(event.document.getText()).length;
      for (let i = 0; i < count; i++) {
        changed.fire(mirrorUri(event.document.uri, i));
      }
    }),
  );
}

function toPosition(p) {
  return new vscode.Position(p.line, p.character);
}

async function waitFor(done, ms = 2000) {
  const end = Date.now() + ms;
  while (!done() && Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

module.exports = { register, SCHEME };
