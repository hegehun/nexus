use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    env, fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, SyncSender},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, State};

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticThresholds {
    cpu_warning: u8,
    cpu_critical: u8,
    gpu_warning: u8,
    gpu_critical: u8,
    memory_warning: u8,
    memory_critical: u8,
    storage_warning: u8,
    storage_critical: u8,
}

impl Default for DiagnosticThresholds {
    fn default() -> Self {
        Self {
            cpu_warning: 85,
            cpu_critical: 95,
            gpu_warning: 85,
            gpu_critical: 95,
            memory_warning: 90,
            memory_critical: 97,
            storage_warning: 70,
            storage_critical: 80,
        }
    }
}

impl DiagnosticThresholds {
    fn is_valid(&self) -> bool {
        (40..=110).contains(&self.cpu_warning)
            && self.cpu_critical > self.cpu_warning && self.cpu_critical <= 120
            && (40..=110).contains(&self.gpu_warning)
            && self.gpu_critical > self.gpu_warning && self.gpu_critical <= 120
            && (50..=99).contains(&self.memory_warning)
            && self.memory_critical > self.memory_warning && self.memory_critical <= 100
            && (30..=100).contains(&self.storage_warning)
            && self.storage_critical > self.storage_warning && self.storage_critical <= 120
    }
}

fn diagnostic_thresholds_path() -> Option<PathBuf> {
    env::var_os("LOCALAPPDATA").map(|root| {
        PathBuf::from(root).join("NEXUS").join("diagnostic-thresholds.json")
    })
}

#[tauri::command]
fn get_diagnostic_thresholds() -> DiagnosticThresholds {
    diagnostic_thresholds_path()
        .and_then(|path| fs::read(path).ok())
        .and_then(|contents| serde_json::from_slice::<DiagnosticThresholds>(&contents).ok())
        .filter(|thresholds| thresholds.is_valid())
        .unwrap_or_default()
}

#[tauri::command]
fn save_diagnostic_thresholds(thresholds: DiagnosticThresholds) -> Result<(), String> {
    if !thresholds.is_valid() {
        return Err("A küszöbértékek érvénytelenek.".into());
    }

    let path = diagnostic_thresholds_path()
        .ok_or_else(|| "A helyi alkalmazásadatok mappája nem érhető el.".to_string())?;
    let directory = path.parent()
        .ok_or_else(|| "A beállításmappa nem található.".to_string())?;
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;

    let temporary = directory.join("diagnostic-thresholds.tmp");
    let content = serde_json::to_vec(&thresholds).map_err(|error| error.to_string())?;
    fs::write(&temporary, content).map_err(|error| error.to_string())?;
    if let Err(error) = fs::rename(&temporary, &path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("A küszöbértékek mentése nem sikerült: {error}"));
    }
    Ok(())
}

struct EngineState {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    latest: Arc<Mutex<Option<Value>>>,
    running: Arc<AtomicBool>,
    pending_controls: Arc<Mutex<HashMap<u64, SyncSender<Result<String, String>>>>>,
    next_control_id: AtomicU64,
}

impl Default for EngineState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
            latest: Arc::new(Mutex::new(None)),
            running: Arc::new(AtomicBool::new(false)),
            pending_controls: Arc::new(Mutex::new(HashMap::new())),
            next_control_id: AtomicU64::new(1),
        }
    }
}

#[tauri::command]
fn start_hardware_engine(state: State<'_, EngineState>) -> Result<String, String> {
    if state.running.load(Ordering::SeqCst) {
        return Ok("already_running".into());
    }

    stop_engine_inner(&state);

    let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_root = manifest
        .parent()
        .ok_or_else(|| "NEXUS project root not found".to_string())?;
    let hardware_project = project_root.join("NEXUS.Hardware").join("NEXUS.Hardware.csproj");

    if !hardware_project.exists() {
        return Err(format!("Hardware project not found: {}", hardware_project.display()));
    }

    let mut command = Command::new("dotnet");
    command
        .arg("run")
        .arg("--project")
        .arg(&hardware_project)
        .arg("--")
        .arg("1000")
        .current_dir(project_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let mut child = command.spawn()
        .map_err(|e| format!("Could not start .NET hardware engine: {e}"))?;

    let stdin = child.stdin.take()
        .ok_or_else(|| "Hardware engine stdin is unavailable".to_string())?;
    *state.stdin.lock().map_err(|e| e.to_string())? = Some(stdin);

    let stdout = child.stdout.take()
        .ok_or_else(|| "Hardware engine stdout is unavailable".to_string())?;
    let stderr = child.stderr.take()
        .ok_or_else(|| "Hardware engine stderr is unavailable".to_string())?;

    if let Ok(mut latest) = state.latest.lock() {
        *latest = None;
    }
    state.running.store(true, Ordering::SeqCst);

    let latest = Arc::clone(&state.latest);
    let running = Arc::clone(&state.running);
    let pending_controls = Arc::clone(&state.pending_controls);
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if let Ok(message) = serde_json::from_str::<Value>(&line) {
                if let Some(command_id) = message.get("controlCommandId").and_then(Value::as_u64) {
                    let success = message.get("success").and_then(Value::as_bool).unwrap_or(false);
                    let detail = message.get("message").and_then(Value::as_str).unwrap_or("A hardvermotor nem adott részletes választ.").to_string();
                    if let Ok(mut pending) = pending_controls.lock() {
                        if let Some(sender) = pending.remove(&command_id) {
                            let _ = sender.send(if success { Ok(detail) } else { Err(detail) });
                        }
                    }
                } else if message.get("Timestamp").or_else(|| message.get("timestamp")).is_some() {
                    if let Ok(mut current) = latest.lock() {
                        *current = Some(message);
                    }
                }
            }
        }
        running.store(false, Ordering::SeqCst);
    });

    thread::spawn(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            eprintln!("[NEXUS Hardware Engine] {line}");
        }
    });

    *state.child.lock().map_err(|e| e.to_string())? = Some(child);
    Ok("started".into())
}

#[tauri::command]
fn get_hardware_snapshot(state: State<'_, EngineState>) -> Option<Value> {
    state.latest.lock().ok().and_then(|value| value.clone())
}

#[tauri::command]
fn set_fan_control(state: State<'_, EngineState>, sensor_identifier: String, value: Option<f32>) -> Result<String, String> {
    if sensor_identifier.is_empty() || sensor_identifier.len() > 512 {
        return Err("Érvénytelen hardvercsatorna-azonosító.".into());
    }
    if let Some(percent) = value {
        if !percent.is_finite() || !(0.0..=100.0).contains(&percent) {
            return Err("A vezérlési értéknek 0 és 100% közé kell esnie.".into());
        }
    }

    let mut stdin = state.stdin.lock().map_err(|e| e.to_string())?;
    let pipe = stdin.as_mut().ok_or_else(|| "A hardvermotor nem fut.".to_string())?;
    let command_id = state.next_control_id.fetch_add(1, Ordering::SeqCst);
    let (sender, receiver) = mpsc::sync_channel(1);
    state.pending_controls.lock().map_err(|e| e.to_string())?.insert(command_id, sender);

    let command = serde_json::json!({
        "commandId": command_id,
        "action": "setControl",
        "sensorIdentifier": sensor_identifier,
        "value": value
    });
    let write_result = writeln!(pipe, "{}", command).and_then(|_| pipe.flush());
    drop(stdin);
    if let Err(error) = write_result {
        if let Ok(mut pending) = state.pending_controls.lock() { pending.remove(&command_id); }
        return Err(format!("A hardverparancs küldése nem sikerült: {error}"));
    }

    match receiver.recv_timeout(Duration::from_secs(5)) {
        Ok(result) => result,
        Err(_) => {
            if let Ok(mut pending) = state.pending_controls.lock() { pending.remove(&command_id); }
            Err("A hardvermotor nem válaszolt a ventilátorparancsra.".into())
        }
    }
}

#[tauri::command]
fn get_hardware_engine_status(state: State<'_, EngineState>) -> bool {
    state.running.load(Ordering::SeqCst)
}

#[tauri::command]
fn stop_hardware_engine(state: State<'_, EngineState>) -> Result<(), String> {
    stop_engine_inner(&state);
    Ok(())
}

fn stop_engine_inner(state: &EngineState) {
    if let Ok(mut stdin) = state.stdin.lock() {
        if let Some(mut pipe) = stdin.take() {
            let _ = writeln!(pipe, r#"{{"commandId":0,"action":"shutdown","sensorIdentifier":"","value":null}}"#);
            let _ = pipe.flush();
        }
    }

    if let Ok(mut guard) = state.child.lock() {
        if let Some(mut child) = guard.take() {
            let deadline = Instant::now() + Duration::from_secs(3);
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(50)),
                    _ => { let _ = child.kill(); let _ = child.wait(); break; }
                }
            }
        }
    }
    state.running.store(false, Ordering::SeqCst);
    if let Ok(mut pending) = state.pending_controls.lock() { pending.clear(); }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(EngineState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_diagnostic_thresholds,
            save_diagnostic_thresholds,
            start_hardware_engine,
            get_hardware_snapshot,
            set_fan_control,
            get_hardware_engine_status,
            stop_hardware_engine
        ])
        .build(tauri::generate_context!())
        .expect("error while building NEXUS");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = app_handle.state::<EngineState>();
            stop_engine_inner(&state);
        }
    });
}
