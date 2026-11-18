use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::VecDeque,
    env, fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
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
}

impl Default for EngineState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
            latest: Arc::new(Mutex::new(None)),
            running: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GameProcess {
    process_id: u32,
    process_name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GameFpsStatus {
    is_running: bool,
    process_id: Option<u32>,
    process_name: Option<String>,
    fps: Option<f64>,
    average_fps: Option<f64>,
    one_percent_low_fps: Option<f64>,
    frame_time_ms: Option<f64>,
    message: String,
}

impl Default for GameFpsStatus {
    fn default() -> Self {
        Self {
            is_running: false,
            process_id: None,
            process_name: None,
            fps: None,
            average_fps: None,
            one_percent_low_fps: None,
            frame_time_ms: None,
            message: "Válassz ki egy futó játékot a méréshez.".into(),
        }
    }
}

struct FpsState {
    child: Mutex<Option<Child>>,
    latest: Arc<Mutex<GameFpsStatus>>,
}

impl Default for FpsState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            latest: Arc::new(Mutex::new(GameFpsStatus::default())),
        }
    }
}

#[cfg(windows)]
mod process_list {
    use super::GameProcess;
    use std::{ffi::c_void, mem::size_of, os::windows::ffi::OsStringExt};

    const TH32CS_SNAPPROCESS: u32 = 0x00000002;
    const INVALID_HANDLE_VALUE: *mut c_void = -1isize as *mut c_void;
    const MAX_PATH: usize = 260;

    #[repr(C)]
    struct ProcessEntry32W {
        size: u32,
        usage: u32,
        process_id: u32,
        default_heap_id: usize,
        module_id: u32,
        threads: u32,
        parent_process_id: u32,
        base_priority: i32,
        flags: u32,
        exe_file: [u16; MAX_PATH],
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn CreateToolhelp32Snapshot(flags: u32, process_id: u32) -> *mut c_void;
        fn Process32FirstW(snapshot: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn Process32NextW(snapshot: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }

    pub fn read() -> Result<Vec<GameProcess>, String> {
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return Err("A futó folyamatok listája nem olvasható.".into());
            }

            let mut entry: ProcessEntry32W = std::mem::zeroed();
            entry.size = size_of::<ProcessEntry32W>() as u32;
            let mut processes = Vec::new();
            let mut ok = Process32FirstW(snapshot, &mut entry) != 0;
            while ok {
                let end = entry.exe_file.iter().position(|unit| *unit == 0).unwrap_or(MAX_PATH);
                let name = std::ffi::OsString::from_wide(&entry.exe_file[..end]).to_string_lossy().into_owned();
                if entry.process_id > 4 && !name.is_empty() && !name.eq_ignore_ascii_case("NEXUS.exe") {
                    processes.push(GameProcess { process_id: entry.process_id, process_name: name });
                }
                ok = Process32NextW(snapshot, &mut entry) != 0;
            }
            CloseHandle(snapshot);
            processes.sort_by(|left, right| left.process_name.to_lowercase().cmp(&right.process_name.to_lowercase()));
            Ok(processes)
        }
    }
}

#[tauri::command]
fn get_running_games() -> Result<Vec<GameProcess>, String> {
    #[cfg(windows)]
    { process_list::read() }
    #[cfg(not(windows))]
    { Err("A játékfolyamat-lista csak Windowson érhető el.".into()) }
}

#[tauri::command]
fn get_game_fps_status(state: State<'_, FpsState>) -> GameFpsStatus {
    state.latest.lock().map(|status| status.clone()).unwrap_or_default()
}

#[tauri::command]
fn start_game_fps(app: tauri::AppHandle, state: State<'_, FpsState>, process_id: u32) -> Result<(), String> {
    stop_fps_inner(&state);
    let process = get_running_games()?.into_iter().find(|item| item.process_id == process_id)
        .ok_or_else(|| "A kiválasztott játék már nem fut. Frissítsd a listát.".to_string())?;

    let bundled = app.path().resource_dir().ok().map(|root| root.join("presentmon").join("PresentMon.exe"));
    let executable = bundled.filter(|path| path.is_file()).unwrap_or_else(|| {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join("presentmon").join("PresentMon.exe")
    });
    if !executable.is_file() {
        return Err("A beépített FPS mérő nem található a telepítésben.".into());
    }

    let mut command = Command::new(executable);
    command.args(["--process_id", &process_id.to_string(), "--output_stdout", "--v1_metrics", "--no_console_stats", "--terminate_on_proc_exit"])
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|error| format!("Az FPS mérő nem indult el: {error}"))?;
    let stdout = child.stdout.take().ok_or_else(|| "Az FPS mérő kimenete nem érhető el.".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Az FPS mérő hibaüzenete nem érhető el.".to_string())?;
    let latest = Arc::clone(&state.latest);
    *latest.lock().map_err(|error| error.to_string())? = GameFpsStatus {
        is_running: true,
        process_id: Some(process_id),
        process_name: Some(process.process_name.clone()),
        fps: None,
        average_fps: None,
        one_percent_low_fps: None,
        frame_time_ms: None,
        message: "Várakozás a játék képkockaadataira…".into(),
    };
    *state.child.lock().map_err(|error| error.to_string())? = Some(child);

    let reader_latest = Arc::clone(&latest);
    thread::spawn(move || {
        let mut header: Option<Vec<String>> = None;
        let mut frames = VecDeque::new();
        let mut frame_times = Vec::new();
        let mut recent_frame_times = VecDeque::new();
        let mut start = Instant::now();
        for line in BufReader::new(stdout).lines().flatten() {
            let line = line.trim_start_matches('\u{feff}').trim();
            if line.is_empty() { continue; }
            if line.starts_with("Application,") {
                header = Some(line.split(',').map(|part| part.trim().trim_matches('"').to_string()).collect());
                start = Instant::now();
                continue;
            }
            let Some(columns) = header.as_ref() else { continue; };
            let values: Vec<&str> = line.split(',').map(|part| part.trim().trim_matches('"')).collect();
            let pid_column = columns.iter().position(|name| name.eq_ignore_ascii_case("ProcessID"));
            if let Some(index) = pid_column {
                if values.get(index).and_then(|value| value.parse::<u32>().ok()) != Some(process_id) { continue; }
            }
            let now = Instant::now();
            frames.push_back(now);
            while frames.front().is_some_and(|time| now.duration_since(*time) > Duration::from_secs(1)) { frames.pop_front(); }
            let frame_time_column = columns.iter().position(|name| name.eq_ignore_ascii_case("MsBetweenDisplayChange"))
                .or_else(|| columns.iter().position(|name| name.eq_ignore_ascii_case("MsBetweenPresents")));
            if let Some(frame_time) = frame_time_column
                .and_then(|index| values.get(index))
                .and_then(|value| value.parse::<f64>().ok())
                .filter(|value| value.is_finite() && (0.5..=1000.0).contains(value))
            {
                frame_times.push(frame_time);
                recent_frame_times.push_back((now, frame_time));
                while recent_frame_times.front().is_some_and(|(time, _)| now.duration_since(*time) > Duration::from_secs(1)) {
                    recent_frame_times.pop_front();
                }
            }
            if now.duration_since(start) >= Duration::from_secs(1) {
                let fps = if !recent_frame_times.is_empty() {
                    1000.0 / (recent_frame_times.iter().map(|(_, value)| value).sum::<f64>() / recent_frame_times.len() as f64)
                } else { frames.len() as f64 };
                let frame_time_ms = if !recent_frame_times.is_empty() {
                    Some(recent_frame_times.iter().map(|(_, value)| value).sum::<f64>() / recent_frame_times.len() as f64)
                } else if fps > 0.0 { Some(1000.0 / fps) } else { None };
                let total_frame_time = frame_times.iter().sum::<f64>();
                let average_fps = if total_frame_time > 0.0 { Some(frame_times.len() as f64 * 1000.0 / total_frame_time) } else { None };
                let one_percent_low_fps = if frame_times.len() >= 100 {
                    let mut slowest = frame_times.clone();
                    slowest.sort_by(|left, right| right.total_cmp(left));
                    let slow_count = (slowest.len() as f64 * 0.01).ceil() as usize;
                    let average_slowest = slowest.iter().take(slow_count.max(1)).sum::<f64>() / slow_count.max(1) as f64;
                    (average_slowest > 0.0).then_some(1000.0 / average_slowest)
                } else { None };
                if let Ok(mut status) = reader_latest.lock() {
                    status.fps = (fps > 0.0).then_some(fps);
                    status.average_fps = average_fps;
                    status.one_percent_low_fps = one_percent_low_fps;
                    status.frame_time_ms = frame_time_ms;
                    status.message = if fps > 0.0 { "Valós képkockaadat · gördülő 1 másodperces mérés".into() } else { "Nem érkezik képkockaadat a kiválasztott folyamattól.".into() };
                }
            }
        }
        if let Ok(mut status) = reader_latest.lock() {
            status.is_running = false;
            status.fps = None;
            status.frame_time_ms = None;
            if !status.message.starts_with("A Windows letiltotta") {
                status.message = "A játék bezárult vagy az FPS mérés leállt.".into();
            }
        }
    });

    thread::spawn(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            if line.to_lowercase().contains("access denied") || line.to_lowercase().contains("failed to start trace") {
                if let Ok(mut status) = latest.lock() {
                    status.message = "A Windows letiltotta a képkockaadatok olvasását. Add a fiókot a Performance Log Users csoporthoz, majd jelentkezz ki és vissza.".into();
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn stop_game_fps(state: State<'_, FpsState>) -> Result<(), String> {
    stop_fps_inner(&state);
    Ok(())
}

fn stop_fps_inner(state: &FpsState) {
    if let Ok(mut child) = state.child.lock() {
        if let Some(mut process) = child.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
    }
    if let Ok(mut status) = state.latest.lock() {
        if status.process_id.is_some() {
            status.is_running = false;
            status.fps = None;
            status.frame_time_ms = None;
            status.message = "A játék FPS-mérése leállt.".into();
        } else {
            *status = GameFpsStatus::default();
        }
    }
}

#[tauri::command]
fn start_hardware_engine(app: tauri::AppHandle, state: State<'_, EngineState>) -> Result<String, String> {
    if state.running.load(Ordering::SeqCst) {
        return Ok("already_running".into());
    }

    stop_engine_inner(&state);

    let bundled_engine = app.path().resource_dir().ok()
        .map(|resources| resources.join("hardware-engine").join("NEXUS.Hardware.exe"));
    let mut command = if let Some(engine) = bundled_engine.filter(|path| path.is_file()) {
        let engine_dir = engine.parent().ok_or_else(|| "Hardware engine directory not found".to_string())?.to_path_buf();
        let mut command = Command::new(&engine);
        command.arg("1000").current_dir(engine_dir);
        command
    } else {
        #[cfg(debug_assertions)]
        {
            let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            let project_root = manifest.parent().ok_or_else(|| "NEXUS project root not found".to_string())?;
            let hardware_project = project_root.join("NEXUS.Hardware").join("NEXUS.Hardware.csproj");
            if !hardware_project.exists() {
                return Err(format!("Hardware project not found: {}", hardware_project.display()));
            }
            let mut command = Command::new("dotnet");
            command.arg("run").arg("--project").arg(&hardware_project).arg("--").arg("1000").current_dir(project_root);
            command
        }
        #[cfg(not(debug_assertions))]
        {
            return Err("A telepített NEXUS-ból hiányzik a beépített hardvermotor.".into());
        }
    };

    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());

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
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if let Ok(message) = serde_json::from_str::<Value>(&line) {
                if message.get("Timestamp").or_else(|| message.get("timestamp")).is_some() {
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
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(EngineState::default())
        .manage(FpsState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_diagnostic_thresholds,
            save_diagnostic_thresholds,
            start_hardware_engine,
            get_hardware_snapshot,
            get_hardware_engine_status,
            stop_hardware_engine,
            get_running_games,
            get_game_fps_status,
            start_game_fps,
            stop_game_fps
        ])
        .build(tauri::generate_context!())
        .expect("error while building NEXUS");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            let state = app_handle.state::<EngineState>();
            stop_engine_inner(&state);
            let fps_state = app_handle.state::<FpsState>();
            stop_fps_inner(&fps_state);
        }
    });
}
