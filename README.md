# Viso editor extensions

The `.vs` language in VSCode and Zed. Both shells are thin: highlighting is each
editor's own (a TextMate grammar in VSCode, Tree-sitter in Zed), and everything else —
diagnostics, hover, go-to-definition, references, rename, formatting, code actions,
completion and semantic tokens — comes from `viso-lsp`, which ships with the Viso CLI. Neither shell reimplements any of
the compiler, the build or inspection: VSCode's Inspector, Events and Profile views run
`viso inspect tree`, `viso inspect events` and `viso profile` with `--json` and show what
they report.

```
vscode/            the VSCode extension
  syntaxes/        TextMate grammar for .vs, and its injection into Rust's ui!/component!
  extension.js     starts viso-lsp; view!("x.vs") links in .rs files
  embedded.js      ui!/component! bodies mirrored to .vs documents for the server
  regions.js       where those bodies are, and the position mapping to their mirrors
  inspect.js       the Inspector, Events and Profile views over the CLI
  stream.js        the CLI's --json event stream, read for those views
  test/            unit tests (node), the grammar test and an integration suite in VSCode
zed/               the Zed extension: languages/viso (config and queries), src/lib.rs
tree-sitter-viso/  the Tree-sitter grammar Zed builds, its queries and tests
fixtures/app/      a small Viso app every test opens
```

## The server

Both shells run `viso-lsp`. VSCode looks at the `viso.server.path` setting, else runs
`viso lsp --stdio`, which finds `viso-lsp` beside `viso`. Zed looks at
`lsp.viso-lsp.binary.path`, else `viso-lsp` on the `PATH`, else `viso lsp`.

## VSCode

```
cd vscode
npm install
node test/units.js                         # the stream reading and the body mirrors
node test/grammar.js                       # the grammar against the fixtures
VISO_LSP=/path/to/viso-lsp node test/run.js  # the suite inside VSCode
```

`test/run.js` downloads a VSCode to run in; `VSCODE_PATH` points it at an installed one
(on macOS `/Applications/Visual Studio Code.app/Contents/MacOS/Code`). Run it from a
plain terminal: inside VSCode's own terminal unset `ELECTRON_RUN_AS_NODE` first.

The suite opens the fixture app and checks a diagnostic, a hover, a definition, semantic
tokens, completion and formatting from the server, the link a `view!("counter.vs")` gives,
and completion and definition inside a `component!` body. With `VISO_CLI` naming a `viso`
and `VISO_INSPECT_APP` an app it can build (such as Viso's `examples/i18n`), it also fills
the Inspector and Profile views from a headless run of that app and opens a node's source.

## The views

The Viso activity-bar container holds three views over the app of the project holding the
active file:

- **Inspector**: `viso inspect tree`, the nodes window by window with box and semantics; a
  node opens the `.vs` source that declares it.
- **Events**: `viso inspect events` followed until stopped: input, focus and each node
  marked dirty with why; a state change opens the state's declaration.
- **Profile**: `viso profile`, p50/p95/max of every span and counter, the trace written.

They ask the `viso run` session on this machine, or `viso.inspect.target` (`headless` runs
the app headless, no session needed, playing `viso.inspect.scenario` if one is named).
`viso.cli.path` names the `viso` they run.

## Rust bodies

In VSCode, completion, hover and go-to-definition work inside `ui! { … }` and
`component! { … }`: each body is mirrored into a `.vs` document the server analyses, and
the answers are mapped back. A mirror's diagnostics are dropped; rustc reports the same
ones through the macro.

To try it: `code --extensionDevelopmentPath=$PWD/vscode fixtures/app`.

## Zed

```
cd tree-sitter-viso
npm install
npx tree-sitter generate
npm test        # corpus and highlight tests; Zed's highlights.scm is this one's copy
```

In Zed: *zed: install dev extension* and pick `zed/`. Zed builds the grammar from this
repository at the `rev` `zed/extension.toml` names, so commit before installing, and set
`repository` to the published URL when there is one.

Completion works as it comes; semantic tokens paint over the Tree-sitter highlighting
only in a Zed whose LSP client requests them.

Zed's extensions cannot add injections to its built-in Rust language, so `ui! { … }`
bodies in `.rs` files are highlighted only in VSCode, and Zed has no document links for
`view!("x.vs")`.
