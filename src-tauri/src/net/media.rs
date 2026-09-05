//! Media provider registry. Binary responses stay in Rust, never in the WebView.
use super::{provider, provider_client, AuthScheme, CostEntry, CostLog};
use crate::keys::SecretStore;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

#[derive(Clone, Deserialize, Serialize)]
pub struct Model {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model: String,
    pub kind: String,
    pub protocol: String,
    pub description: String,
    pub source: String,
}
pub fn catalog() -> Vec<Model> {
    serde_json::from_str(include_str!("../../../src/lib/media-catalog.json"))
        .expect("media registry")
}
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Generate {
    pub catalog_id: String,
    pub model: String,
    pub prompt: String,
    pub seconds: u32,
    pub ratio: String,
    pub instrumental: bool,
    #[serde(default)]
    pub workflow: Option<Value>,
    #[serde(default)]
    pub prompt_node: String,
    #[serde(default)]
    pub prompt_input: String,
    #[serde(default)]
    pub output_node: String,
}
pub fn configured(m: &Model, store: &dyn SecretStore) -> bool {
    m.protocol == "comfy" || store.has(&m.provider)
}
pub fn request(r: &Generate) -> Result<(Model, String, Value), String> {
    let m = catalog()
        .into_iter()
        .find(|m| m.id == r.catalog_id)
        .ok_or("Unknown media model")?;
    if r.prompt.trim().is_empty()
        || r.prompt.encode_utf16().count() > 4000
        || r.model.is_empty()
        || r.model.len() > 160
        || !r
            .model
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-._/".contains(&c))
        || !["16:9", "9:16"].contains(&r.ratio.as_str())
        || !(2..=600).contains(&r.seconds)
    {
        return Err("Check prompt (1–4,000 characters), model, duration and aspect ratio.".into());
    }
    let (path, body) = match m.protocol.as_str() {
        "interaction" => {
            if m.kind == "audio" && r.seconds > 180 {
                return Err("Keep Lyria requests within 180 seconds.".into());
            }
            let mut b = json!({"model":r.model,"input":format!("{}\nRequested duration: {} seconds. {}",r.prompt,r.seconds,if r.instrumental && m.kind == "audio" {"Instrumental, no vocals."} else {""})});
            if m.kind == "video" {
                b["response_format"] = json!({"type":"video","aspect_ratio":r.ratio,"resolution":"720p","delivery":"uri"});
                b["background"] = json!(false);
                b["store"] = json!(false);
            }
            ("/v1beta/interactions", b)
        }
        "runway" | "runway-veo" | "runway-china" | "runway-hailuo" => {
            if r.prompt.encode_utf16().count() > 1000
                || r.seconds > 10
                || (m.protocol == "runway-veo" && ![4, 6, 8].contains(&r.seconds))
            {
                return Err("Runway: prompt up to 1,000 characters; Gen-4.5 2–10 seconds, Veo 4/6/8 seconds.".into());
            }
            let mut b = json!({"model":r.model,"promptText":r.prompt,"duration":r.seconds,"ratio":if r.ratio == "9:16" {"720:1280"} else {"1280:720"}});
            if m.protocol != "runway" {
                b["audio"] = json!(false);
            }
            if m.protocol == "runway-hailuo" {
                b.as_object_mut().unwrap().remove("audio");
                b["ratio"] = json!(r.ratio);
                b["resolution"] = json!("768p");
            }
            ("/v1/text_to_video", b)
        }
        "eleven" => (
            "/v1/music?output_format=mp3_44100_128",
            json!({"model_id":r.model,"prompt":r.prompt,"music_length_ms":r.seconds * 1000,"force_instrumental":r.instrumental}),
        ),
        "minimax-music" => {
            if r.prompt.chars().count() > 1900 {
                return Err("Keep MiniMax music prompts under 1,900 characters.".into());
            }
            (
                "/v1/music_generation",
                json!({"model":r.model,"prompt":format!("{} Requested duration: {} seconds.",r.prompt,r.seconds),"lyrics_optimizer":!r.instrumental,"is_instrumental":r.instrumental,"stream":false,"output_format":"hex","audio_setting":{"sample_rate":44100,"bitrate":256000,"format":"mp3"}}),
            )
        }
        "comfy" => {
            let mut graph = r
                .workflow
                .clone()
                .ok_or("Configure a ComfyUI API-format workflow below first.")?;
            let nodes = graph
                .as_object()
                .ok_or("Workflow must be an API-format node object, not the UI workflow format.")?;
            if graph.to_string().len() > 128_000
                || nodes.is_empty()
                || nodes.len() > 200
                || nodes
                    .values()
                    .any(|n| !n["class_type"].is_string() || !n["inputs"].is_object())
            {
                return Err("Use an API-format workflow with up to 200 nodes and 128 KB.".into());
            }
            if r.output_node.is_empty() || !nodes.contains_key(&r.output_node) {
                return Err(
                    "Choose the Save Video / Save Audio output node ID from your workflow.".into(),
                );
            }
            let input = graph
                .get_mut(&r.prompt_node)
                .and_then(|n| n.get_mut("inputs"))
                .and_then(|n| n.get_mut(&r.prompt_input))
                .ok_or("Prompt node/input was not found in the workflow.")?;
            if !input.is_string() {
                return Err("The chosen prompt input must be a text field.".into());
            }
            *input = json!(r.prompt);
            ("/prompt", json!({"prompt":graph}))
        }
        _ => return Err("Media protocol is not implemented.".into()),
    };
    Ok((m, path.into(), body))
}

pub async fn fetch(
    m: &Model,
    path: &str,
    body: Option<&Value>,
    store: &dyn SecretStore,
    log: &CostLog,
) -> Result<Vec<u8>, String> {
    let local = m.protocol == "comfy";
    let entry = provider(&m.provider);
    let base = if local {
        "http://127.0.0.1:8188"
    } else {
        entry.ok_or("Provider missing")?.base_url
    };
    // Paths originate in this module; operation IDs are validated before interpolation.
    let mut req = provider_client()
        .no_proxy()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?
        .request(
            if body.is_some() {
                reqwest::Method::POST
            } else {
                reqwest::Method::GET
            },
            format!("{base}{path}"),
        );
    if !local {
        let entry = entry.ok_or("Provider missing")?;
        let key = store
            .get(entry.id)
            .ok_or_else(|| format!("Add a {} API key in Settings.", entry.id))?;
        req = match entry.auth {
            AuthScheme::Bearer => req.bearer_auth(key),
            AuthScheme::HeaderKey(h) => req.header(h, key),
        };
    }
    if m.protocol.starts_with("runway") {
        req = req.header("X-Runway-Version", "2024-11-06");
    }
    if let Some(b) = body {
        req = req.json(b);
    }
    // Same rule as provider_fetch and the agent bridge: nothing is sent from a headless run.
    super::live_guard(&format!("media provider \"{}\"", m.provider))?;
    let started = Instant::now();
    let mut status = 0;
    let result = async {
        let response = req.send().await.map_err(|_| "Media request connection failed or timed out. Check provider history before generating again.")?;
        status = response.status().as_u16();
        if !response.status().is_success() { return Err(format!("{} returned HTTP {status}. Check model access, credits and prompt in your provider account.", m.name)); }
        read_bounded(response, 192 * 1024 * 1024).await
    }.await;
    let _ = log.append(&CostEntry {
        at_ms: super::now_ms(),
        provider: m.provider.clone(),
        method: if body.is_some() { "POST" } else { "GET" }.into(),
        path: super::strip_query(path),
        status,
        duration_ms: started.elapsed().as_millis() as u64,
        bytes_out: body.map_or(0, |v| v.to_string().len() as u64),
        bytes_in: result.as_ref().map_or(0, |v| v.len() as u64),
        error: result.as_ref().err().cloned(),
        model: Some(m.model.clone()),
        estimated_cost_usd: None,
    });
    result
}
async fn read_bounded(mut response: reqwest::Response, limit: usize) -> Result<Vec<u8>, String> {
    if response.content_length().is_some_and(|n| n > limit as u64) {
        return Err("Media response exceeds the size limit.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Media download interrupted.")?
    {
        if bytes.len() + chunk.len() > limit {
            return Err("Media response exceeds the size limit.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
pub enum Output {
    Pending(String),
    Inline(Vec<u8>, String, String),
    Download(String, String),
}
pub fn response(m: &Model, bytes: Vec<u8>) -> Result<Output, String> {
    if m.protocol == "eleven" {
        return Ok(Output::Inline(bytes, "mp3".into(), String::new()));
    }
    let v: Value = serde_json::from_slice(&bytes).map_err(|_| "Invalid media response JSON")?;
    if m.protocol == "minimax-music" {
        if v["base_resp"]["status_code"] != 0 || v["data"]["status"] != 2 {
            return Err("MiniMax music generation failed. Check existing-account eligibility, credits and model access.".into());
        }
        let hex = v["data"]["audio"]
            .as_str()
            .ok_or("MiniMax returned no audio")?;
        if hex.len() % 2 != 0 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("Invalid MiniMax audio encoding".into());
        }
        let data = (0..hex.len())
            .step_by(2)
            .map(|i| {
                u8::from_str_radix(&hex[i..i + 2], 16)
                    .map_err(|_| "Invalid MiniMax audio encoding".to_string())
            })
            .collect::<Result<Vec<_>, _>>()?;
        return Ok(Output::Inline(data, "mp3".into(), String::new()));
    }
    if m.protocol == "comfy" {
        let task = v["prompt_id"]
            .as_str()
            .ok_or("ComfyUI rejected the workflow. Check missing nodes/models in ComfyUI.")?;
        valid_task(task)?;
        return Ok(Output::Pending(task.into()));
    }
    if m.protocol.starts_with("runway") {
        if v["status"] == "FAILED" || v["status"] == "CANCELED" || v["status"] == "CANCELLED" {
            return Err("Provider task failed or was canceled. Check its dashboard.".into());
        }
        if v["status"] == "SUCCEEDED" {
            return Ok(Output::Download(
                v["output"][0]
                    .as_str()
                    .ok_or("Task returned no video")?
                    .into(),
                "mp4".into(),
            ));
        }
        let id = v["id"].as_str().ok_or("Provider returned no task ID")?;
        valid_task(id)?;
        return Ok(Output::Pending(id.into()));
    }
    let blocks: Vec<&Value> = v["steps"]
        .as_array()
        .ok_or("Interaction returned no steps")?
        .iter()
        .filter(|s| s["type"] == "model_output")
        .filter_map(|s| s["content"].as_array())
        .flatten()
        .collect();
    let lyrics = blocks
        .iter()
        .filter(|b| b["type"] == "text")
        .filter_map(|b| b["text"].as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let b = blocks
        .iter()
        .find(|b| b["type"] == m.kind)
        .ok_or("No media output; the prompt may have been blocked.")?;
    let ext = match b["mime_type"].as_str() {
        Some("video/mp4") => "mp4",
        Some("audio/mpeg" | "audio/mp3") => "mp3",
        Some("audio/wav" | "audio/x-wav") => "wav",
        _ => return Err("Unsupported media format returned by provider.".into()),
    };
    if let Some(data) = b["data"].as_str() {
        return Ok(Output::Inline(
            base64::engine::general_purpose::STANDARD
                .decode(data)
                .map_err(|_| "Invalid media encoding")?,
            ext.into(),
            lyrics.chars().take(32000).collect(),
        ));
    }
    Ok(Output::Download(
        b["uri"]
            .as_str()
            .ok_or("No media data or download URI")?
            .into(),
        ext.into(),
    ))
}
pub fn valid_task(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 160
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
    {
        return Err("Invalid provider task ID".into());
    }
    Ok(())
}
pub fn download_url(m: &Model, uri: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(uri).map_err(|_| "Invalid media download URL")?;
    if m.protocol == "comfy" {
        if url.scheme() == "http"
            && url.host_str() == Some("127.0.0.1")
            && url.port() == Some(8188)
            && url.path() == "/view"
            && url.username().is_empty()
            && url.password().is_none()
        {
            return Ok(url);
        }
        return Err("Local ComfyUI downloads must use 127.0.0.1:8188/view".into());
    }
    let host = url.host_str().unwrap_or("");
    let allowed = if m.protocol.starts_with("runway") {
        host.ends_with(".cloudfront.net") || host.ends_with(".runwayml.com")
    } else {
        host == "generativelanguage.googleapis.com" && url.path().starts_with("/v1beta/files/")
    };
    if !allowed
        || url.scheme() != "https"
        || url.port().is_some_and(|p| p != 443)
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Provider returned an unsupported download host. Download the clip from its dashboard and import it.".into());
    }
    Ok(url)
}
pub async fn download(m: &Model, uri: &str, store: &dyn SecretStore) -> Result<Vec<u8>, String> {
    let url = download_url(m, uri)?;
    super::live_guard("a media download")?;
    let mut req = provider_client()
        .no_proxy()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?
        .get(url);
    if m.protocol == "interaction" {
        req = req.header(
            "x-goog-api-key",
            store.get("gemini").ok_or("Google API key missing")?,
        );
    }
    // Runway's signed CDN URL needs no API key. Never forward credentials or follow redirects.
    let resp = req
        .send()
        .await
        .map_err(|_| "Media download failed; refresh the job to retry.")?;
    if !resp.status().is_success() {
        return Err(format!(
            "Download HTTP {}. Refresh the job or import the dashboard download.",
            resp.status().as_u16()
        ));
    }
    read_bounded(resp, 128 * 1024 * 1024).await
}

pub async fn poll(
    m: &Model,
    r: &Generate,
    task: &str,
    store: &dyn SecretStore,
    log: &CostLog,
) -> Result<Output, String> {
    valid_task(task)?;
    if m.protocol.starts_with("runway") {
        return response(
            m,
            fetch(m, &format!("/v1/tasks/{task}"), None, store, log).await?,
        );
    }
    if m.protocol != "comfy" {
        return Err("This provider does not expose a resumable task.".into());
    }
    let value: Value =
        serde_json::from_slice(&fetch(m, &format!("/history/{task}"), None, store, log).await?)
            .map_err(|_| "Invalid ComfyUI history")?;
    comfy_output(m, r, task, &value)
}
fn comfy_output(m: &Model, r: &Generate, task: &str, v: &Value) -> Result<Output, String> {
    let result = &v[task];
    if result.is_null() {
        return Ok(Output::Pending(task.into()));
    }
    if result["status"]["status_str"] == "error" {
        return Err("ComfyUI workflow failed. Open ComfyUI for node errors; this job will not be resubmitted.".into());
    }
    let Some(output) = result["outputs"][&r.output_node].as_object() else {
        if result["status"]["completed"] == true {
            return Err("Workflow completed without the configured output node. Check Save Video/Save Audio.".into());
        }
        return Ok(Output::Pending(task.into()));
    };
    let supported = if m.kind == "video" {
        &["mp4", "webm", "mov", "mkv"][..]
    } else {
        &["mp3", "wav", "flac", "ogg"][..]
    };
    let files: Vec<_> = output
        .values()
        .filter_map(|v| v.as_array())
        .flatten()
        .filter(|v| {
            v["filename"]
                .as_str()
                .is_some_and(|f| supported.contains(&f.rsplit('.').next().unwrap_or("")))
        })
        .collect();
    if files.len() != 1 {
        return Err("Configure one saved media file in the chosen ComfyUI output node.".into());
    }
    let f = files[0];
    let filename = f["filename"].as_str().ok_or("Missing output filename")?;
    let subfolder = f["subfolder"].as_str().unwrap_or("");
    if filename.contains(['/', '\\'])
        || filename.len() > 240
        || subfolder.contains("..")
        || subfolder.contains('\\')
        || subfolder.starts_with('/')
    {
        return Err("Invalid ComfyUI output path".into());
    }
    let mut url = reqwest::Url::parse("http://127.0.0.1:8188/view").unwrap();
    url.query_pairs_mut()
        .append_pair("filename", filename)
        .append_pair("subfolder", subfolder)
        .append_pair("type", "output");
    Ok(Output::Download(
        url.into(),
        filename.rsplit('.').next().unwrap().into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn media_contracts_and_host_boundaries() {
        let fixture: Value =
            serde_json::from_str(include_str!("../../../tests/fixtures/providers/media.json"))
                .unwrap();
        for m in catalog() {
            let seconds = if m.kind == "audio" { 60 } else { 8 };
            let (mut model, path, body) = request(&Generate {
                catalog_id: m.id,
                model: m.model,
                prompt: "Original scene".into(),
                seconds,
                ratio: "9:16".into(),
                instrumental: true,
                workflow:Some(json!({"1":{"class_type":"CLIPTextEncode","inputs":{"text":"old"}},"2":{"class_type":"SaveVideo","inputs":{}}})),
                prompt_node:"1".into(),prompt_input:"text".into(),output_node:"2".into(),
            })
            .unwrap();
            assert!(path.starts_with('/'));
            if model.protocol.starts_with("runway") {
                assert_eq!(
                    body["ratio"],
                    if model.protocol == "runway-hailuo" {
                        "9:16"
                    } else {
                        "720:1280"
                    }
                );
                assert!(matches!(
                    response(
                        &model,
                        serde_json::to_vec(&fixture["runwayPending"]).unwrap()
                    )
                    .unwrap(),
                    Output::Pending(_)
                ));
                assert!(matches!(
                    response(
                        &model,
                        serde_json::to_vec(&fixture["runwayComplete"]).unwrap()
                    )
                    .unwrap(),
                    Output::Download(_, _)
                ));
            } else if model.protocol == "interaction" {
                model.kind = "audio".into();
                assert!(
                    matches!(response(&model,serde_json::to_vec(&fixture["interaction"]).unwrap()).unwrap(),Output::Inline(b,_,_) if b == b"ID3")
                );
            }
            for url in [
                "http://127.0.0.1/x",
                "https://evil.runwayml.com.evil.test/x",
                "https://generativelanguage.googleapis.com@evil.test/x",
                "https://generativelanguage.googleapis.com:8443/v1beta/files/x",
            ] {
                assert!(download_url(&model, url).is_err());
            }
        }
        assert!(valid_task("../../x").is_err());
        let local = catalog().into_iter().find(|m| m.id == "comfy-wan").unwrap();
        let r = Generate {
            output_node: "2".into(),
            ..Default::default()
        };
        assert!(matches!(
            comfy_output(&local, &r, "task", &json!({})).unwrap(),
            Output::Pending(_)
        ));
        let history = json!({"task":{"status":{"completed":true},"outputs":{"2":{"images":[{"filename":"film.mp4","subfolder":"video","type":"output"}]}}}});
        assert!(
            matches!(comfy_output(&local,&r,"task",&history).unwrap(),Output::Download(url,ext) if url.contains("filename=film.mp4") && ext=="mp4")
        );
        let music = catalog()
            .into_iter()
            .find(|m| m.id == "minimax-music")
            .unwrap();
        assert!(
            matches!(response(&music,serde_json::to_vec(&json!({"base_resp":{"status_code":0},"data":{"status":2,"audio":"494433"}})).unwrap()).unwrap(),Output::Inline(b,_,_) if b==b"ID3")
        );
        assert!(response(
            &music,
            serde_json::to_vec(&json!({"base_resp":{"status_code":1000}})).unwrap()
        )
        .is_err());
    }
}
