// The Inspector, Events and Profile views: `viso inspect tree`, `viso inspect`
// and `viso profile`, run with `--json` and shown as trees whose rows open the
// source the CLI names. Nothing here knows a Viso type; it reads the stream.

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const vscode = require("vscode");
const stream = require("./stream");

const output = vscode.window.createOutputChannel("Viso");

function config() {
  return vscode.workspace.getConfiguration("viso");
}

/** The `viso` executable. */
function cli() {
  return config().get("cli.path") || "viso";
}

/** The target the views ask about: empty for the running Dev Session. */
function target() {
  return config().get("inspect.target") || "";
}

/** The project the views ask about: the one holding the active file, else the
 * first in the workspace. */
async function project() {
  const active = vscode.window.activeTextEditor;
  if (active && active.document.uri.scheme === "file") {
    let dir = path.dirname(active.document.uri.fsPath);
    for (;;) {
      if (fs.existsSync(path.join(dir, "Viso.toml"))) {
        return dir;
      }
      const up = path.dirname(dir);
      if (up === dir) {
        break;
      }
      dir = up;
    }
  }
  const [manifest] = await vscode.workspace.findFiles(
    "**/Viso.toml",
    "{**/node_modules/**,**/target/**}",
    1,
  );
  return manifest ? path.dirname(manifest.fsPath) : undefined;
}

/**
 * Runs `viso <args> --json` in the project, handing each event to `onEvent`.
 * Resolves with the exit code; `stop()` interrupts it as Ctrl-C would.
 */
function run(dir, args, onEvent) {
  const child = spawn(cli(), [...args, "--json"], { cwd: dir });
  const reader = stream.lines(
    (event) => {
      if (event.type === "log") {
        output.appendLine(event.payload.message);
      } else if (event.type === "diagnostic") {
        output.appendLine(`${event.payload.code}: ${event.payload.message}`);
      }
      onEvent(event);
    },
    (text) => output.appendLine(text),
  );
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => reader.push(chunk));
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => output.append(chunk));
  const done = new Promise((resolve) => {
    child.on("error", (error) => {
      output.appendLine(`viso: ${error.message}`);
      resolve(-1);
    });
    child.on("close", (code) => {
      reader.end();
      resolve(code);
    });
  });
  return { done, stop: () => child.kill("SIGINT") };
}

/** Runs a query with a progress notification; the failure's diagnostics, if
 * any, become the error shown. */
async function query(title, args, onEvent) {
  const dir = await project();
  if (!dir) {
    vscode.window.showErrorMessage("Viso: no Viso.toml in the workspace.");
    return false;
  }
  const errors = [];
  const code = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: true },
    (progress, token) => {
      const job = run(dir, args, (event) => {
        if (event.type === "progress") {
          progress.report({ message: event.payload.message });
        } else if (event.type === "log" && event.payload.source === "tool") {
          progress.report({ message: event.payload.message.trim() });
        } else if (event.type === "diagnostic" && event.payload.severity === "error") {
          errors.push(event.payload.message);
        }
        onEvent(event, dir);
      });
      token.onCancellationRequested(job.stop);
      return job.done;
    },
  );
  if (code !== 0 && code !== 130) {
    const why = errors[0] || `\`viso ${args.join(" ")}\` exited ${code}; see the Viso output`;
    vscode.window.showErrorMessage(`Viso: ${why}`);
    return false;
  }
  return true;
}

/** A view row. */
class Row extends vscode.TreeItem {
  constructor(label, options = {}) {
    super(
      label,
      options.children && options.children.length
        ? options.expanded
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.children = options.children || [];
    this.description = options.description;
    this.tooltip = options.tooltip;
    if (options.icon) {
      this.iconPath = new vscode.ThemeIcon(options.icon);
    }
    if (options.source && options.dir) {
      this.command = {
        command: "viso.openSource",
        title: "Open Source",
        arguments: [options.dir, options.source],
      };
    }
  }
}

/** A tree view over a list of rows the caller replaces. */
class Rows {
  constructor() {
    this.rows = [];
    this.changed = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.changed.event;
  }

  set(rows) {
    this.rows = rows;
    this.changed.fire();
  }

  getTreeItem(row) {
    return row;
  }

  getChildren(row) {
    return row ? row.children : this.rows;
  }
}

function nodeRow(node, dir, depth) {
  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(`**${stream.nodeLabel(node)}** \`${node.node_id}\``);
  if (node.symbol) {
    tooltip.appendMarkdown(`\n\n${node.symbol}`);
  }
  if (node.components && node.components.length) {
    tooltip.appendMarkdown(`\n\nroot of ${node.components.join(", ")}`);
  }
  return new Row(stream.nodeLabel(node), {
    description: stream.nodeDescription(node),
    tooltip,
    children: node.children.map((c) => nodeRow(c, dir, depth + 1)),
    expanded: depth < 2,
    source: node.source_span,
    dir,
  });
}

function register(context) {
  const tree = new Rows();
  const events = new Rows();
  const profile = new Rows();
  let following;

  const inspectTree = async () => {
    let result;
    const ok = await query("Viso: inspect tree", ["inspect", "tree", ...targetArgs()], (e, dir) => {
      if (e.type === "result") {
        result = { payload: e.payload, dir };
      }
    });
    if (!ok || !result) {
      return;
    }
    const windows = stream.tree(result.payload);
    const rows = windows.map((w) =>
      new Row(`window ${w.window}`, {
        description: `${w.count} nodes`,
        children: w.roots.map((n) => nodeRow(n, result.dir, 0)),
        expanded: true,
        icon: "window",
      }),
    );
    tree.set(windows.length === 1 ? rows[0].children : rows);
  };

  const followEvents = async () => {
    if (following) {
      return;
    }
    const dir = await project();
    if (!dir) {
      vscode.window.showErrorMessage("Viso: no Viso.toml in the workspace.");
      return;
    }
    const rows = [];
    const job = run(dir, ["inspect", "events", ...targetArgs()], (event) => {
      if (event.type !== "inspect") {
        return;
      }
      const row = stream.eventRow(event.payload);
      if (!row) {
        return;
      }
      const icon = { input: "record-keys", focus: "target", dirty: "debug-restart" }[row.kind];
      rows.unshift(new Row(row.label, { description: row.description, icon, source: row.source, dir }));
      rows.length = Math.min(rows.length, 1000);
      events.set(rows.slice());
    });
    following = job;
    vscode.commands.executeCommand("setContext", "viso.following", true);
    const code = await job.done;
    following = undefined;
    vscode.commands.executeCommand("setContext", "viso.following", false);
    if (code !== 0 && code !== 130 && code !== null) {
      vscode.window.showErrorMessage(
        `Viso: \`viso inspect events\` exited ${code}; is \`viso run\` running? See the Viso output.`,
      );
    }
  };

  const runProfile = async () => {
    const seconds = config().get("profile.seconds") || 5;
    const t = target();
    const args = ["profile", ...(t ? [t] : [])];
    if (t === "headless") {
      args.push(...scenarioArgs());
    } else {
      args.push("--seconds", String(seconds));
    }
    let payload;
    const artifacts = [];
    const ok = await query(`Viso: profile (${t || "dev session"})`, args, (e) => {
      if (e.type === "profile") {
        payload = e.payload;
      } else if (e.type === "artifact") {
        artifacts.push(e.payload);
      }
    });
    if (!ok || !payload) {
      return;
    }
    const rows = [
      new Row(`${payload.frames} frames in ${Math.round(payload.duration_ms)} ms`, {
        description: [payload.target, payload.device].filter(Boolean).join(" "),
        icon: "pulse",
      }),
      ...stream.profileRows(payload).map((m) => new Row(m.name, { description: m.description })),
    ];
    if (payload.unavailable && payload.unavailable.length) {
      rows.push(new Row("unavailable", { description: payload.unavailable.join(", "), icon: "circle-slash" }));
    }
    for (const caveat of payload.caveats || []) {
      rows.push(new Row(caveat, { icon: "warning" }));
    }
    for (const artifact of artifacts) {
      const row = new Row(path.basename(artifact.path), { description: artifact.kind, icon: "file-binary" });
      row.resourceUri = vscode.Uri.file(artifact.path);
      row.command = { command: "revealFileInOS", title: "Reveal", arguments: [row.resourceUri] };
      rows.push(row);
    }
    profile.set(rows);
  };

  context.subscriptions.push(
    output,
    vscode.window.registerTreeDataProvider("viso.tree", tree),
    vscode.window.registerTreeDataProvider("viso.events", events),
    vscode.window.registerTreeDataProvider("viso.profile", profile),
    vscode.commands.registerCommand("viso.inspectTree", inspectTree),
    vscode.commands.registerCommand("viso.followEvents", followEvents),
    vscode.commands.registerCommand("viso.stopEvents", () => following && following.stop()),
    vscode.commands.registerCommand("viso.profile", runProfile),
    vscode.commands.registerCommand("viso.openSource", openSource),
    { dispose: () => following && following.stop() },
  );
  return { tree, events, profile };
}

function targetArgs() {
  const t = target();
  return t ? ["--target", t, ...scenarioArgs()] : [];
}

/** The scenario a headless run plays, from `tests/ui/`. */
function scenarioArgs() {
  const scenario = config().get("inspect.scenario");
  return target() === "headless" && scenario ? ["--scenario", scenario] : [];
}

/** Opens `span` of a file the CLI names relative to the project. */
async function openSource(dir, span) {
  const file = path.isAbsolute(span.file) ? span.file : path.join(dir, span.file);
  const document = await vscode.workspace.openTextDocument(file);
  const start = stream.spanStart(span);
  const end = stream.spanEnd(span);
  await vscode.window.showTextDocument(document, {
    selection: new vscode.Range(start.line, start.character, end.line, end.character),
    preview: true,
  });
}

module.exports = { register };
