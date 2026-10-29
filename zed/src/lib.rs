//! The Viso extension for Zed: it starts viso-lsp for `.vs` files. The
//! highlighting is the Tree-sitter grammar's; everything else is the
//! server's.

use zed_extension_api::settings::LspSettings;
use zed_extension_api::{self as zed, LanguageServerId, Result};

struct Viso;

impl zed::Extension for Viso {
    fn new() -> Self {
        Viso
    }

    /// The server: `lsp.viso-lsp.binary` from the settings, else `viso-lsp`
    /// on the worktree's `PATH`, else `viso lsp`, which finds it beside
    /// `viso`.
    fn language_server_command(
        &mut self,
        id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let binary = LspSettings::for_worktree(id.as_ref(), worktree)
            .ok()
            .and_then(|settings| settings.binary);
        if let Some(path) = binary.as_ref().and_then(|binary| binary.path.clone()) {
            return Ok(zed::Command {
                command: path,
                args: binary
                    .and_then(|binary| binary.arguments)
                    .unwrap_or_default(),
                env: worktree.shell_env(),
            });
        }
        if let Some(path) = worktree.which("viso-lsp") {
            return Ok(zed::Command {
                command: path,
                args: Vec::new(),
                env: worktree.shell_env(),
            });
        }
        if let Some(viso) = worktree.which("viso") {
            return Ok(zed::Command {
                command: viso,
                args: vec!["lsp".into(), "--stdio".into()],
                env: worktree.shell_env(),
            });
        }
        Err("viso-lsp is not on the PATH: install it beside `viso`, or set `lsp.viso-lsp.binary.path`".into())
    }
}

zed::register_extension!(Viso);
