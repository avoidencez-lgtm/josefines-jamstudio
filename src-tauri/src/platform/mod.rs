//! Native child-process behavior is isolated from the agent protocol.
use std::path::PathBuf;

pub fn command(executable: &std::path::Path) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(executable);
    command.kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    command
}

pub fn find_agent(name: &str, configured: &str) -> Result<PathBuf, String> {
    if !configured.is_empty() {
        let path = PathBuf::from(configured);
        if !path.is_absolute() || !path.is_file() {
            return Err("Choose the full path to the installed agent executable.".into());
        }
        #[cfg(windows)]
        if path.extension().and_then(|s| s.to_str()) != Some("exe") {
            return Err("Choose the native .exe installation, not a shell script.".into());
        }
        return Ok(path);
    }
    let filename = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.into()
    };
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".local/bin"));
    }
    #[cfg(target_os = "macos")]
    dirs.extend(
        [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/Applications/Codex.app/Contents/Resources",
            "/Applications/ChatGPT.app/Contents/Resources",
        ]
        .map(PathBuf::from),
    );
    dirs.into_iter().map(|d| d.join(&filename)).find(|p| p.is_file())
        .ok_or_else(|| format!("{name} is not installed or not on PATH. Install and sign in once, or set its full executable path."))
}
