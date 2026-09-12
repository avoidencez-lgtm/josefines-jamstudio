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
    open_with_os(url).await
}

#[cfg(windows)]
fn windows_media_open_command(path: &std::path::Path) -> Result<tokio::process::Command, String> {
    let file = path
        .to_str()
        .ok_or_else(|| "Media path is not valid Unicode.".to_string())?;
    let mut opener = command(std::path::Path::new("cmd.exe"));
    opener.args(["/C", "start", "", file]);
    Ok(opener)
}

pub async fn open_media(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut opener = command(std::path::Path::new("/usr/bin/open"));
        return launch_opener(opener.arg(path)).await;
    }
    #[cfg(windows)]
    {
        // explorer.exe <file> selects the file; `cmd /c start "" <file>` opens the player.
        let mut opener = windows_media_open_command(path)?;
        let status = opener.status().await.map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(
                "The system could not open this item. Check the default application.".into(),
            );
        }
        Ok(())
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let mut opener = command(std::path::Path::new("xdg-open"));
        launch_opener(opener.arg(path)).await
    }
}

async fn open_with_os(target: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        let target = target.to_string();
        tokio::task::spawn_blocking(move || windows_shell_open(&target))
            .await
            .unwrap_or_else(|e| Err(e.to_string()))
    }
    #[cfg(target_os = "macos")]
    let mut opener = command(std::path::Path::new("/usr/bin/open"));
    #[cfg(not(any(target_os = "macos", windows)))]
    let mut opener = command(std::path::Path::new("xdg-open"));
    #[cfg(not(windows))]
    launch_opener(opener.arg(target)).await
}

/// ShellExecuteW is how a user double-clicking an https shortcut opens the
/// default browser. `explorer.exe` plus CREATE_NO_WINDOW often does nothing.
#[cfg(windows)]
fn windows_shell_open(target: &str) -> Result<(), String> {
    let failed = || -> String {
        "The system could not open this item. Check the default application.".into()
    };
    if target.is_empty() {
        return Err(failed());
    }
    use std::os::windows::ffi::OsStrExt;
    fn wide(s: &str) -> Vec<u16> {
        std::ffi::OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }
    #[link(name = "shell32")]
    extern "system" {
        fn ShellExecuteW(
            hwnd: *mut core::ffi::c_void,
            operation: *const u16,
            file: *const u16,
            parameters: *const u16,
            directory: *const u16,
            show: i32,
        ) -> isize;
    }
    const SW_SHOWNORMAL: i32 = 1;
    let operation = wide("open");
    let file = wide(target);
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result <= 32 {
        return Err(failed());
    }
    Ok(())
}

#[cfg(not(windows))]
async fn launch_opener(opener: &mut tokio::process::Command) -> Result<(), String> {
    let status = opener.status().await.map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("The system could not open this item. Check the default application.".into());
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

/// On Windows, closing this handle kills the whole process tree (`cmd.exe` and `node.exe`).
pub struct KillTree {
    #[cfg(windows)]
    job: Option<isize>,
}

impl KillTree {
    pub fn bind(child: &tokio::process::Child) -> Self {
        #[cfg(windows)]
        {
            Self {
                job: win_job::assign(child),
            }
        }
        #[cfg(not(windows))]
        {
            let _ = child;
            Self {}
        }
    }
}

impl Drop for KillTree {
    fn drop(&mut self) {
        #[cfg(windows)]
        win_job::close(self.job.take());
    }
}

#[cfg(windows)]
mod win_job {
    #[link(name = "kernel32")]
    extern "system" {
        fn CreateJobObjectW(
            attr: *mut core::ffi::c_void,
            name: *const u16,
        ) -> *mut core::ffi::c_void;
        fn SetInformationJobObject(
            job: *mut core::ffi::c_void,
            class: i32,
            info: *mut core::ffi::c_void,
            len: u32,
        ) -> i32;
        fn AssignProcessToJobObject(
            job: *mut core::ffi::c_void,
            process: *mut core::ffi::c_void,
        ) -> i32;
        fn CloseHandle(handle: *mut core::ffi::c_void) -> i32;
    }

    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: i32 = 9;
    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;

    #[repr(C)]
    pub struct ExtendedLimit {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        _pad0: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        _pad1: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    pub fn assign(child: &tokio::process::Child) -> Option<isize> {
        unsafe {
            let job = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
            if job.is_null() {
                return None;
            }
            let mut info = ExtendedLimit {
                per_process_user_time_limit: 0,
                per_job_user_time_limit: 0,
                limit_flags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
                _pad0: 0,
                minimum_working_set_size: 0,
                maximum_working_set_size: 0,
                active_process_limit: 0,
                _pad1: 0,
                affinity: 0,
                priority_class: 0,
                scheduling_class: 0,
                read_operation_count: 0,
                write_operation_count: 0,
                other_operation_count: 0,
                read_transfer_count: 0,
                write_transfer_count: 0,
                other_transfer_count: 0,
                process_memory_limit: 0,
                job_memory_limit: 0,
                peak_process_memory_used: 0,
                peak_job_memory_used: 0,
            };
            if SetInformationJobObject(
                job,
                JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                (&mut info as *mut ExtendedLimit).cast(),
                std::mem::size_of::<ExtendedLimit>() as u32,
            ) == 0
            {
                CloseHandle(job);
                return None;
            }
            let handle = child.raw_handle()?;
            if AssignProcessToJobObject(job, handle) == 0 {
                CloseHandle(job);
                return None;
            }
            Some(job as isize)
        }
    }

    pub fn close(job: Option<isize>) {
        if let Some(job) = job {
            unsafe {
                CloseHandle(job as *mut core::ffi::c_void);
            }
        }
    }
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
        if !agent_stem_matches(&path, name) {
            return Err(format!(
                "Choose the {name} executable, not a different program."
            ));
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

fn agent_stem_matches(path: &std::path::Path, name: &str) -> bool {
    path.file_stem()
        .and_then(|s| s.to_str())
        .is_some_and(|stem| stem.eq_ignore_ascii_case(name))
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

    #[tokio::test]
    async fn disallowed_https_fails_before_the_os_opener() {
        assert!(super::open_https("https://evil.example/").await.is_err());
        assert!(super::open_https("http://ffmpeg.org/download.html")
            .await
            .is_err());
    }
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn windows_play_uses_cmd_start_not_explorer() {
        let path = std::path::Path::new(r"C:\Users\Public\song.wav");
        let cmd = super::windows_media_open_command(path).unwrap();
        let debug = format!("{cmd:?}");
        assert!(debug.to_ascii_lowercase().contains("cmd.exe"), "{debug}");
        assert!(debug.contains("start"), "{debug}");
        assert!(
            !debug.to_ascii_lowercase().contains("explorer.exe"),
            "{debug}"
        );
    }

    #[tokio::test]
    async fn windows_play_errors_when_the_os_cannot_open_the_file() {
        let missing =
            std::env::temp_dir().join(format!("jam-missing-media-{}.wav", std::process::id()));
        let _ = std::fs::remove_file(&missing);
        assert!(super::open_media(&missing).await.is_err());
    }

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
        assert!(
            super::find_agent("codex", &path("claude.EXE")).is_err(),
            "configured path stem must equal the agent name"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn job_object_extended_limit_is_the_x64_windows_layout() {
        assert_eq!(std::mem::size_of::<super::win_job::ExtendedLimit>(), 144);
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

    #[test]
    fn windows_shell_open_reports_failure_instead_of_hidden_explorer() {
        let err = super::windows_shell_open("").unwrap_err();
        assert!(err.contains("could not open"), "{err}");
        let src = include_str!("mod.rs");
        let https = src
            .split("pub async fn open_https")
            .nth(1)
            .and_then(|rest| rest.split("pub async fn open_media").next())
            .unwrap_or("");
        assert!(
            !https.contains("explorer.exe"),
            "https open must not launch explorer.exe"
        );
        assert!(https.contains("open_with_os"));
    }

    #[tokio::test]
    async fn dropping_the_job_kills_the_cmd_shim_child_tree() {
        let dir = std::env::temp_dir().join(format!("jam-job-tree-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let child_script = dir.join("jam-child.cmd");
        let parent = dir.join("jam-shim.cmd");
        let heartbeat = dir.join("heartbeat.txt");
        std::fs::write(
            &child_script,
            format!(
                "@echo off\r\n:loop\r\necho alive>\"{}\"\r\nping -n 2 127.0.0.1 >nul\r\ngoto loop\r\n",
                heartbeat.display()
            ),
        )
        .unwrap();
        std::fs::write(
            &parent,
            format!("@echo off\r\ncmd /c \"{}\"\r\n", child_script.display()),
        )
        .unwrap();
        let mut child = super::command(&parent).spawn().expect("shim must spawn");
        let tree = super::KillTree::bind(&child);
        let mut saw_heartbeat = false;
        for _ in 0..40 {
            if heartbeat.exists() {
                saw_heartbeat = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        assert!(saw_heartbeat, "child process never started");
        drop(tree);
        let _ = child.kill().await;
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        let first = std::fs::metadata(&heartbeat).unwrap().modified().unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
        let second = std::fs::metadata(&heartbeat).unwrap().modified().unwrap();
        assert_eq!(
            first, second,
            "cmd.exe child kept running after the job closed"
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}

#[cfg(test)]
mod agent_path_tests {
    #[test]
    fn configured_executable_stem_must_match_the_agent() {
        let dir = std::env::temp_dir().join(format!("jam-agent-stem-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let wrong = if cfg!(windows) {
            dir.join("other.exe")
        } else {
            dir.join("other")
        };
        std::fs::write(&wrong, b"x").unwrap();
        assert!(super::find_agent("codex", &wrong.to_string_lossy()).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
