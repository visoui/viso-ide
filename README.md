# Viso editor extensions

The `.vs` language in VSCode and Zed. Both shells are thin: highlighting is each
editor's own (a TextMate grammar in VSCode, Tree-sitter in Zed), and everything else —
diagnostics, hover, go-to-definition, references, rename, formatting, code actions,
completion and semantic tokens — comes from `viso-lsp`, which ships with the Viso CLI. Neither shell reimplements any of
the compiler, the build or inspection.

```
vscode/            the VSCode extension
  syntaxes/        TextMate grammar for .vs, and its injection into Rust's ui!/component!
  extension.js     starts viso-lsp; view!("x.vs") links in .rs files
  test/            grammar test (vscode-textmate) and an integration suite in VSCode
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
node test/grammar.js                       # the grammar against the fixtures
VISO_LSP=/path/to/viso-lsp node test/run.js  # the suite inside VSCode
```

`test/run.js` downloads a VSCode to run in; `VSCODE_PATH` points it at an installed one
(on macOS `/Applications/Visual Studio Code.app/Contents/MacOS/Code`). Run it from a
plain terminal: inside VSCode's own terminal unset `ELECTRON_RUN_AS_NODE` first.

The suite opens the fixture app and checks a diagnostic, a hover, a definition, semantic
tokens, completion and formatting from the server, and the link a `view!("counter.vs")`
gives.

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
