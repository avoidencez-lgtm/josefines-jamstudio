//! Explicit local CLI requests. Credentials remain owned by the installed agent.
use crate::{
    net::{CostEntry, CostLog},
    platform,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    process::Stdio,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    sync::Mutex,
};

#[derive(Default)]
pub struct AgentRunner {
    gate: Mutex<()>,
    cancelled: AtomicBool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRequest {
    pub provider: String,
    pub prompt: String,
    pub model: String,
    #[serde(default)]
    pub executable: String,
}
#[derive(Serialize)]
pub struct AgentStatus {
    pub installed: bool,
    pub message: String,
}

fn agent_name(provider: &str) -> Result<&'static str, String> {
    AGENTS
        .iter()
        .find(|a| a.0 == provider)
        .map(|a| a.1)
        .ok_or_else(|| "Unknown local agent.".into())
}
const AGENTS: &[(&str, &str)] = &[("codex", "codex"), ("claude-code", "claude")];
const OUTPUT_LIMIT: u64 = 2 * 1024 * 1024;
fn output_schema() -> Value {
    json!({"type":"object","additionalProperties":false,"properties":{
        "reply":{"type":"string"},"toolCalls":{"type":"array","items":{"type":"object","additionalProperties":false,
        "properties":{"name":{"type":"string"},"argumentsJson":{"type":"string"}},"required":["name","argumentsJson"]}}},"required":["reply","toolCalls"]})
}
fn arguments(name: &str, model: &str, schema_path: &str) -> Vec<String> {
    let mut args: Vec<String> = if name == "codex" {
        [
            "exec",
            "--ignore-user-config",
            "--ephemeral",
            "--skip-git-repo-check",
            "--sandbox",
            "read-only",
            "--json",
            "--color",
            "never",
            "--output-schema",
            schema_path,
            "-c",
            "features.shell_tool=false",
            "-c",
            "features.apps=false",
            "-c",
            "web_search=\"disabled\"",
        ]
        .into_iter()
        .map(String::from)
        .collect()
    } else {
        [
            "-p",
            "--output-format",
            "json",
            "--tools",
            "",
            "--disallowedTools",
            "mcp__*",
            "--strict-mcp-config",
            "--mcp-config",
            "{\"mcpServers\":{}}",
            "--setting-sources",
            "",
            "--settings",
            "{\"disableAllHooks\":true}",
            "--no-session-persistence",
            "--permission-mode",
            "dontAsk",
            "--max-turns",
            "2",
            "--json-schema",
        ]
        .into_iter()
        .map(String::from)
        .chain([output_schema().to_string()])
        .collect()
    };
    if model != "default" {
        args.extend(["--model".into(), model.into()]);
    }
    if name == "codex" {
        args.push("-".into());
    }
    args
}
async fn read_bounded(reader: impl AsyncRead + Unpin) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader
        .take(OUTPUT_LIMIT + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| "Could not read agent response.".to_string())?;
    if bytes.len() as u64 > OUTPUT_LIMIT {
        return Err("Agent output exceeded 2 MiB.".into());
    }
    Ok(bytes)
}

fn failed_cli(name: &str, stderr: &[u8]) -> String {
    let tail: String = String::from_utf8_lossy(stderr)
        .chars()
        .rev()
        .take(200)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    let tail = tail.trim();
    if tail.is_empty() {
        format!(
            "{name} exited unsuccessfully. Check login, usage limits and CLI version; no studio actions applied."
        )
    } else {
        format!(
            "{name} exited unsuccessfully ({tail}). Check login, usage limits and CLI version; no studio actions applied."
        )
    }
}

pub fn parse_reply(name: &str, stdout: &[u8]) -> Result<Value, String> {
    let invalid = || {
        "Agent returned no complete structured reply. Update the CLI or try a shorter request."
            .to_string()
    };
    if name == "claude" {
        let value: Value = serde_json::from_slice(stdout).map_err(|_| invalid())?;
        if value["is_error"] == true {
            return Err(
                "Claude Code could not complete the request. Check its login and usage limits."
                    .into(),
            );
        }
        return value
            .get("structured_output")
            .filter(|v| v.is_object())
            .cloned()
            .ok_or_else(invalid);
    }
    let mut final_text = None;
    let mut complete = false;
    for line in stdout.split(|b| *b == b'\n').filter(|l| !l.is_empty()) {
        let event: Value = serde_json::from_slice(line).map_err(|_| invalid())?;
        if event["type"] == "turn.failed" || event["type"] == "error" {
            return Err(
                "Codex could not complete the request. Check its login and usage limits.".into(),
            );
        }
        if event["type"] == "turn.completed" {
            complete = true;
        }
        if event["type"] == "item.completed" && event["item"]["type"] == "agent_message" {
            final_text = event["item"]["text"].as_str().map(String::from);
        }
    }
    if !complete {
        return Err(invalid());
    }
    serde_json::from_str(&final_text.ok_or_else(invalid)?).map_err(|_| invalid())
}
impl AgentRunner {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }
    pub async fn status(provider: &str, executable: &str) -> AgentStatus {
        let result = async {
            let name = agent_name(provider)?;
            let path = platform::find_agent(name, executable)?;
            let mut command = platform::command(&path);
            command.arg("--version").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).kill_on_drop(true);
            let status = tokio::time::timeout(Duration::from_secs(5), command.status()).await
                .map_err(|_| "Agent detection timed out.".to_string())?.map_err(|_| "Agent could not start.".to_string())?;
            if !status.success() { return Err("Agent --version failed. Check the executable path.".into()); }
            Ok::<_, String>(format!("{name} detected. Uses its own saved login; account access is checked when you send a request."))
        }.await;
        match result {
            Ok(message) => AgentStatus {
                installed: true,
                message,
            },
            Err(message) => AgentStatus {
                installed: false,
                message,
            },
        }
    }
    pub async fn run(&self, req: AgentRequest, log: &CostLog) -> Result<Value, String> {
        crate::net::live_guard("a signed-in agent")?;
        let _guard = self
            .gate
            .try_lock()
            .map_err(|_| "An agent is already working. Wait or cancel it.".to_string())?;
        self.cancelled.store(false, Ordering::Relaxed);
        let name = agent_name(&req.provider)?;
        if req.prompt.len() > 128 * 1024
            || req.model.is_empty()
            || req.model.len() > 160
            || !req
                .model
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "_.:/-".contains(c))
        {
            return Err("Invalid model or agent request too long.".into());
        }
        let path = platform::find_agent(name, &req.executable)?;
        let dir = dirs::data_local_dir()
            .ok_or("Application data directory unavailable")?
            .join("JosefinesJamstudio/agent-work");
        std::fs::create_dir_all(&dir).map_err(|_| "Could not create agent working directory")?;
        let schema = dir.join("reply-schema.json");
        std::fs::write(&schema, output_schema().to_string())
            .map_err(|_| "Could not write agent reply schema")?;
        let mut command = platform::command(&path);
        command
            .args(arguments(name, &req.model, &schema.to_string_lossy()))
            .current_dir(&dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        // No API keys passed by Jamstudio, and no inherited key silently switches billing.
        for key in [
            "OPENAI_API_KEY",
            "CODEX_API_KEY",
            "ANTHROPIC_API_KEY",
            "ANTHROPIC_AUTH_TOKEN",
            "CLAUDE_CODE_OAUTH_TOKEN",
        ] {
            command.env_remove(key);
        }
        let started = Instant::now();
        let mut child = command.spawn().map_err(|_| {
            format!("Could not start {name}. Install its native CLI and check the path.")
        })?;
        let pid = child.id();
        let stdin = child.stdin.take().ok_or("Agent stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("Agent stdout unavailable")?;
        let stderr = child.stderr.take().ok_or("Agent stderr unavailable")?;
        let result = {
            let work = async {
                let write = async {
                    let mut input = stdin;
                    input
                        .write_all(req.prompt.as_bytes())
                        .await
                        .map_err(|_| "Could not send the agent request".to_string())?;
                    drop(input);
                    Ok(())
                };
                let wait = async {
                    child
                        .wait()
                        .await
                        .map_err(|_| "Could not wait for agent".to_string())
                };
                let (_, out, err, status) =
                    tokio::try_join!(write, read_bounded(stdout), read_bounded(stderr), wait)?;
                if !status.success() {
                    return Err(failed_cli(name, &err));
                }
                parse_reply(name, &out)
            };
            let cancel = async {
                loop {
                    if self.cancelled.load(Ordering::Relaxed) {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            };
            tokio::select! {
                r = work => r,
                _ = tokio::time::sleep(Duration::from_secs(180)) => Err("Agent timed out after three minutes. No studio actions applied.".into()),
                _ = cancel => Err("Agent request cancelled. No studio actions applied.".into()),
            }
        };
        if let Some(pid) = pid {
            platform::kill_tree(pid).await;
        }
        let _ = child.kill().await;
        let entry = CostEntry {
            at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            provider: req.provider,
            method: "LOCAL".into(),
            path: "agent/request".into(),
            status: if result.is_ok() { 200 } else { 0 },
            duration_ms: started.elapsed().as_millis() as u64,
            bytes_out: req.prompt.len() as u64,
            bytes_in: result
                .as_ref()
                .map(|v| v.to_string().len() as u64)
                .unwrap_or(0),
            error: result.as_ref().err().cloned(),
            model: Some(req.model),
            estimated_cost_usd: None,
            ..CostEntry::default()
        };
        if log.append(&entry).is_err() {
            tracing::warn!("Could not save agent usage metadata");
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cli_contracts_disable_external_actions_and_accept_only_complete_output() {
        let args = arguments("codex", "default", "schema.json");
        assert!(args.contains(&"--ignore-user-config".into()));
        assert!(args.contains(&"read-only".into()));
        assert!(!args.contains(&"--model".into()));
        let claude = arguments("claude", "sonnet", "schema.json");
        assert!(claude.windows(2).any(|a| a == ["--tools", ""]));
        assert!(claude.contains(&"mcp__*".into()));
        let reply = json!({"reply":"Ready", "toolCalls":[]});
        let events = format!(
            "{}\n{}\n",
            json!({"type":"item.completed","item":{"type":"agent_message","text":reply.to_string()}}),
            json!({"type":"turn.completed"})
        );
        assert_eq!(parse_reply("codex", events.as_bytes()).unwrap(), reply);
        assert!(parse_reply("codex", b"{\"type\":\"turn.failed\"}\n").is_err());
        assert!(parse_reply("codex", b"{}").is_err());
        assert_eq!(
            parse_reply(
                "claude",
                json!({"is_error":false,"structured_output":reply})
                    .to_string()
                    .as_bytes()
            )
            .unwrap(),
            reply
        );
        assert!(parse_reply("claude", b"{\"is_error\":true}").is_err());
    }
    #[tokio::test]
    async fn bounded_output_and_missing_agent_fail_without_a_model_call() {
        assert!(
            read_bounded(std::io::Cursor::new(vec![b'x'; OUTPUT_LIMIT as usize + 1]))
                .await
                .is_err()
        );
        assert!(!AgentRunner::status("unknown", "").await.installed);
        assert!(
            !AgentRunner::status("codex", "/missing/jam-agent")
                .await
                .installed
        );
        let with_tail = super::failed_cli("codex", b"not logged in\n");
        assert!(with_tail.contains("not logged in"), "{with_tail}");
        assert!(super::failed_cli("codex", b"").contains("Check login"));
    }

    #[tokio::test]
    async fn tests_block_agent_requests_before_executable_lookup() {
        if std::env::var("JAM_LIVE").as_deref() == Ok("1") {
            return;
        }
        let result = AgentRunner::default()
            .run(
                AgentRequest {
                    provider: "codex".into(),
                    prompt: "must not be sent".into(),
                    model: "default".into(),
                    executable: "/missing/test-agent".into(),
                },
                &CostLog::new(std::env::temp_dir().join("jam-blocked-agent-test.jsonl")),
            )
            .await;
        assert!(result.unwrap_err().contains("Headless tests cannot call"));
    }

    /// Explicit manual acceptance only; uses the installed CLI's signed-in account.
    #[tokio::test]
    #[ignore = "manual live Codex check; consumes account usage"]
    async fn live_codex_structured_reply() {
        assert_eq!(std::env::var("JAM_LIVE").as_deref(), Ok("1"));
        let runner = AgentRunner::default();
        let log = CostLog::new(std::env::temp_dir().join("jam-live-agent-usage.jsonl"));
        let result = runner.run(AgentRequest { provider: "codex".into(), model: "default".into(), executable: String::new(),
            prompt: "Protocol check only. Do not use any tools or read files. Return the required JSON envelope with reply equal to Ready and toolCalls an empty array.".into() }, &log).await.expect("live Codex bridge request");
        assert_eq!(result["reply"], "Ready");
        assert_eq!(result["toolCalls"], json!([]));
    }
}
