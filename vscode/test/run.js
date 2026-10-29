// Runs the suite in VSCode with the extension loaded, on the fixture app,
// against the viso-lsp `VISO_LSP` names. `VSCODE_PATH` picks an installed
// VSCode; without it one is downloaded.

const os = require("os");
const fs = require("fs");
const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  if (!process.env.VISO_LSP) {
    console.log("integration: skipped (set VISO_LSP to a viso-lsp binary)");
    return;
  }
  const root = path.join(__dirname, "..");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "viso-vscode-"));
  try {
    await runTests({
      vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
      extensionDevelopmentPath: root,
      extensionTestsPath: path.join(__dirname, "suite.js"),
      extensionTestsEnv: { VISO_LSP: process.env.VISO_LSP },
      launchArgs: [
        path.join(root, "..", "fixtures", "app"),
        "--disable-extensions",
        "--disable-workspace-trust",
        "--user-data-dir",
        path.join(profile, "data"),
        "--extensions-dir",
        path.join(profile, "extensions"),
      ],
    });
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
