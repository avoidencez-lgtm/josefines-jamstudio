//! Native child-process behavior is isolated from the agent protocol.
use std::path::PathBuf;
pub mod cpu;
pub mod song_dialog;
pub mod voice_shortcut;

/// Hosts the UI may open in the OS browser. Keep in lockstep with `https://` links in `src/`.
const ALLOWED_HOSTS: &[&str] = &[
    "ffmpeg.org",
    "docs.comfy.org",
    "developers.openai.com",
    "support.claude.com",
    "ai.google.dev",
    "platform.claude.com",
    "openrouter.ai",
    "huggingface.co",
    "platform.minimax.io",
    "docs.dev.runwayml.com",
    "github.com",
    "elevenlabs.io",
    "music.ai",
];

/// `https://` and an allowlisted host only. Rejects other schemes, credentials and hosts.
pub fn allowed_https_url(url: &str) -> Result<&str, String> {
    let rest = url
        .strip_prefix("https://")
        .ok_or_else(|| "Only https links from the documented hosts can open.".to_string())?;
    if rest.contains('@') {
        return Err("This link is not allowed.".into());
    }
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if !ALLOWED_HOSTS.contains(&host) {
        return Err(format!(
            "This host is not on the open-in-browser list. {host}"
        ));
    }
    Ok(url)
}

pub async fn open_https(url: &str) -> Result<(), String> {
    allowed_https_url(url)?;
    #[cfg(target_os = "macos")]
    let mut opener = command(std::path::Path::new("/usr/bin/open"));
    #[cfg(windows)]
    let mut opener = command(std::path::Path::new("explorer.exe"));
    #[cfg(not(any(target_os = "macos", windows)))]
    let mut opener = command(std::path::Path::new("xdg-open"));
    launch_opener(opener.arg(url)).await
}

pub async fn open_media(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut opener = command(std::path::Path::new("/usr/bin/open"));
    #[cfg(windows)]
    let mut opener = command(std::path::Path::new("explorer.exe"));
    #[cfg(not(any(target_os = "macos", windows)))]
    let mut opener = command(std::path::Path::new("xdg-open"));
    // The user's explicit Play action opens their default media player.
    launch_opener(opener.arg(path)).await
}

async fn launch_opener(opener: &mut tokio::process::Command) -> Result<(), String> {
    // Explorer hands off to an existing process; its exit code does not prove
    // whether a browser/player opened. macOS open and xdg-open report failure.
    #[cfg(windows)]
    opener
        .kill_on_drop(false)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(not(windows))]
    {
        let status = opener.status().await.map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(
                "The system could not open this item. Check the default application.".into(),
            );
        }
    }
    Ok(())
}

pub fn command(executable: &std::path::Path) -> tokio::process::Command {
    #[cfg(windows)]
    let mut command = windows_command(executable);
    #[cfg(not(windows))]
    let mut command = tokio::process::Command::new(executable);
    command.kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    command
}

/// CreateProcessW cannot run `.cmd` / `.bat`; npm agent shims must go through cmd.exe.
#[cfg(windows)]
fn windows_command(executable: &std::path::Path) -> tokio::process::Command {
    if windows_batch_shim(executable) {
        let mut command = tokio::process::Command::new("cmd.exe");
        command.arg("/c").arg(executable);
        command
    } else {
        tokio::process::Command::new(executable)
    }
}

#[cfg(windows)]
fn windows_batch_shim(executable: &std::path::Path) -> bool {
    executable
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|ext| matches!(ext.to_ascii_lowercase().as_str(), "cmd" | "bat"))
}

/// Windows executables the app will start: a native `.exe`, or the `.cmd` shim npm
/// writes for `npm install -g @openai/codex` / `@anthropic-ai/claude-code`. The shim
/// runs through cmd.exe with the standard library's argument escaping; the prompt
/// travels over stdin, so no request text ever becomes a command-line argument.
#[cfg(windows)]
const WINDOWS_EXTENSIONS: &[&str] = &["exe", "cmd"];

#[cfg(windows)]
fn windows_extension_allowed(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .is_some_and(|ext| WINDOWS_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

pub fn find_agent(name: &str, configured: &str) -> Result<PathBuf, String> {
    if !configured.is_empty() {
        let path = PathBuf::from(configured);
        if !path.is_absolute() || !path.is_file() {
            return Err("Choose the full path to the installed agent executable.".into());
        }
        #[cfg(windows)]
        if !windows_extension_allowed(&path) {
            return Err(
                "Choose the native .exe or the npm .cmd shim, not another script type.".into(),
            );
        }
        return Ok(path);
    }
    let filenames: Vec<String> = if cfg!(windows) {
        ["exe", "cmd"]
            .iter()
            .map(|ext| format!("{name}.{ext}"))
            .collect()
    } else {
        vec![name.into()]
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
    // A native executable earlier on PATH wins over a shim later on PATH.
    dirs.iter()
        .flat_map(|d| filenames.iter().map(move |f| d.join(f)))
        .find(|p| p.is_file())
        .ok_or_else(|| format!("{name} is not installed or not on PATH. Install and sign in once, or set its full executable path."))
}

#[cfg(test)]
mod url_tests {
    #[cfg(unix)]
    #[tokio::test]
    async fn opener_reports_application_failure() {
        let mut opener = super::command(std::path::Path::new("/bin/sh"));
        assert!(super::launch_opener(opener.args(["-c", "exit 1"]))
            .await
            .is_err());
        let mut opener = super::command(std::path::Path::new("/bin/sh"));
        assert!(super::launch_opener(opener.args(["-c", "exit 0"]))
            .await
            .is_ok());
    }

    #[test]
    fn https_allowlist_accepts_docs_and_rejects_the_rest() {
        assert!(super::allowed_https_url("https://ffmpeg.org/download.html").is_ok());
        assert!(super::allowed_https_url("https://ai.google.dev/gemini-api/docs/pricing").is_ok());
        assert!(super::allowed_https_url("https://music.ai/docs/api/reference/").is_ok());
        assert!(super::allowed_https_url("http://ffmpeg.org/download.html").is_err());
        assert_eq!(
            super::allowed_https_url("https://evil.example/ffmpeg.org").unwrap_err(),
            "This host is not on the open-in-browser list. evil.example"
        );
        assert!(super::allowed_https_url("https://ffmpeg.org.evil.example/").is_err());
        assert!(super::allowed_https_url("https://user:pass@ffmpeg.org/").is_err());
        assert!(super::allowed_https_url("file:///etc/passwd").is_err());
    }
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn windows_accepts_native_exe_and_npm_cmd_shim_only() {
        let dir = std::env::temp_dir().join(format!("jam-agent-shim-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        for name in ["codex.cmd", "claude.EXE", "codex.ps1"] {
            std::fs::write(dir.join(name), b"@echo off").unwrap();
        }
        let path = |n: &str| dir.join(n).to_string_lossy().into_owned();
        assert!(super::find_agent("codex", &path("codex.cmd")).is_ok());
        assert!(super::find_agent("claude", &path("claude.EXE")).is_ok());
        assert!(super::find_agent("codex", &path("codex.ps1")).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn windows_cmd_and_bat_shims_launch_through_cmd_exe() {
        let cmd = super::command(std::path::Path::new(r"C:\npm\claude.cmd"));
        let debug = format!("{cmd:?}");
        assert!(
            debug.contains("cmd.exe"),
            "CreateProcessW cannot execute .cmd: {debug}"
        );
        assert!(debug.contains("/c"), "{debug}");
        assert!(debug.contains("claude.cmd"), "{debug}");
        let bat = super::command(std::path::Path::new(r"C:\tools\tool.BAT"));
        let debug = format!("{bat:?}");
        assert!(debug.contains("cmd.exe"), "{debug}");
        let exe = super::command(std::path::Path::new(r"C:\Program Files\claude.exe"));
        let debug = format!("{exe:?}");
        assert!(
            !debug.contains("cmd.exe"),
            "native .exe must not be wrapped: {debug}"
        );
    }

    #[tokio::test]
    async fn windows_cmd_shim_runs_instead_of_bad_exe_format() {
        let dir = std::env::temp_dir().join(format!("jam-cmd-run-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("jam-echo.cmd");
        let output = dir.join("out.txt");
        std::fs::write(&script, format!("@echo ran>\"{}\"\r\n", output.display())).unwrap();
        let status = super::command(&script)
            .status()
            .await
            .expect("cmd shim must spawn");
        assert!(status.success(), "{status:?}");
        assert_eq!(std::fs::read_to_string(&output).unwrap().trim(), "ran");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
