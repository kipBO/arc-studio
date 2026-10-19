#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, OpenOptions};
use std::io::{self, Read, Write};
#[cfg(target_os = "macos")]
use std::ffi::CString;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use tauri::{Manager, RunEvent, State, WebviewWindowBuilder, WindowEvent};

#[tauri::command]
fn read_arc_project_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if !is_arc_project_path(&path) {
        return Err("Choose an .arcproject file.".to_string());
    }
    let metadata = fs::metadata(&path).map_err(|error| format!("Could not read the project file: {error}"))?;
    if !metadata.is_file() || metadata.len() > 128 * 1024 * 1024 {
        return Err("The project file is too large to open.".to_string());
    }
    fs::read_to_string(path).map_err(|error| format!("Could not read the project file: {error}"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectExportReceipt {
    path: String,
    revealed: bool,
}

#[tauri::command]
fn save_project_export<R: tauri::Runtime>(app: tauri::AppHandle<R>, filename: String, contents: String) -> Result<ProjectExportReceipt, String> {
    if contents.len() > 128 * 1024 * 1024 {
        return Err("The project export is too large to save.".to_string());
    }
    let safe_name = filename
        .chars()
        .filter(|character| !character.is_control() && !matches!(character, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect::<String>()
        .trim_matches(|character| character == ' ' || character == '.')
        .to_string();
    let stem = safe_name.strip_suffix(".arcproject").unwrap_or(&safe_name);
    if stem.trim().is_empty() || stem == "." || stem == ".." {
        return Err("Choose a valid project name before exporting.".to_string());
    }

    let directory = app.path().download_dir()
        .map_err(|error| format!("Could not locate your Downloads folder: {error}"))?;
    fs::create_dir_all(&directory).map_err(|error| format!("Could not access your Downloads folder: {error}"))?;
    let mut suffix = 0u32;
    let path = loop {
        let name = if suffix == 0 { format!("{stem}.arcproject") } else { format!("{stem} ({suffix}).arcproject") };
        let path = directory.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                #[cfg(unix)]
                file.set_permissions(fs::Permissions::from_mode(0o600)).map_err(|error| format!("Could not secure the project export: {error}"))?;
                file.write_all(contents.as_bytes()).map_err(|error| {
                    let _ = fs::remove_file(&path);
                    format!("Could not write the project export: {error}")
                })?;
                break path;
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => suffix += 1,
            Err(error) => return Err(format!("Could not save the project export: {error}")),
        }
    };

    #[cfg(target_os = "macos")]
    let reveal = Command::new("open").arg("-R").arg(&path).spawn();
    #[cfg(target_os = "windows")]
    let reveal = Command::new("explorer").arg(format!("/select,{}", path.display())).spawn();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let reveal = Command::new("xdg-open").arg(&directory).spawn();
    let revealed = reveal.is_ok();
    if let Err(error) = reveal {
        eprintln!("Project export saved at {}, but its folder could not be opened: {error}", path.display());
    }
    Ok(ProjectExportReceipt { path: path.to_string_lossy().into_owned(), revealed })
}

#[tauri::command]
fn open_project_window(project_id: String) -> Result<(), String> {
    let valid_id = project_id.strip_prefix("project_").is_some_and(|uuid| {
        uuid.len() == 36 && uuid.chars().enumerate().all(|(index, character)| {
            if [8, 13, 18, 23].contains(&index) { character == '-' }
            else { character.is_ascii_hexdigit() }
        })
    });
    if !valid_id { return Err("That project ID is not valid.".to_string()); }
    let executable = std::env::current_exe().map_err(|error| format!("Could not locate ARC Studio: {error}"))?;
    Command::new(executable)
        .arg("--arc-project-id")
        .arg(project_id)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the project in a new window: {error}"))
}

fn is_arc_project_path(path: &Path) -> bool {
    path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("arcproject"))
}

fn notify_project_file_opened<R: tauri::Runtime>(app: &tauri::AppHandle<R>, path: &Path) {
    if !is_arc_project_path(path) { return; }
    let Some(window) = app.get_webview_window("main") else { return; };
    let path = js_string_literal(&path.to_string_lossy());
    let script = format!(
        "window.__ARC_STUDIO_OPEN_PROJECT_FILES__ ||= []; window.__ARC_STUDIO_OPEN_PROJECT_FILES__.push({path}); window.dispatchEvent(new CustomEvent('arc:project-file-opened', {{ detail: {path} }}));"
    );
    let _ = window.eval(&script);
}

#[tauri::command]
fn get_workspace_password(origin: String) -> Result<Option<String>, String> {
    let entry = workspace_credential_entry(&origin)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Could not read the saved workspace credential: {error}")),
    }
}

#[tauri::command]
fn save_workspace_password(origin: String, password: String) -> Result<(), String> {
    workspace_credential_entry(&origin)?
        .set_password(&password)
        .map_err(|error| format!("Could not save the workspace credential: {error}"))
}

#[tauri::command]
fn delete_workspace_password(origin: String) -> Result<(), String> {
    let entry = workspace_credential_entry(&origin)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Could not remove the saved workspace credential: {error}")),
    }
}

fn bot_token_encryption_key() -> Result<String, String> {
    let entry = keyring::Entry::new("studio.arc.desktop", "bot-token-encryption-key")
        .map_err(|_| "Could not access the system credential store for bot-token encryption.".to_string())?;
    match entry.get_password() {
        Ok(key) if key.len() >= 64 => Ok(key),
        Ok(_) => Err("The saved bot-token encryption key is invalid.".to_string()),
        Err(keyring::Error::NoEntry) => {
            let key = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
            entry.set_password(&key)
                .map_err(|_| "Could not save the bot-token encryption key in the system credential store.".to_string())?;
            Ok(key)
        }
        Err(_) => Err("Could not read the bot-token encryption key from the system credential store.".to_string()),
    }
}

#[tauri::command]
fn set_release_channel_icon<R: tauri::Runtime>(app: tauri::AppHandle<R>, icon_png: Vec<u8>) -> Result<(), String> {
    if icon_png.len() > 2 * 1024 * 1024 || !icon_png.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("The release channel icon is not a valid PNG image.".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = sender.send(unsafe { set_macos_dock_icon(&icon_png) });
        }).map_err(|error| format!("Could not schedule the Dock icon update: {error}"))?;
        receiver.recv_timeout(Duration::from_secs(5)).map_err(|_| "The Dock icon update timed out.".to_string())??;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, icon_png);
    Ok(())
}

#[cfg(target_os = "macos")]
unsafe fn set_macos_dock_icon(icon_png: &[u8]) -> Result<(), String> {
    use std::ffi::c_void;
    #[link(name = "AppKit", kind = "framework")]
    extern "C" {}
    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const std::ffi::c_char) -> *mut c_void;
        fn sel_registerName(name: *const std::ffi::c_char) -> *mut c_void;
        fn objc_msgSend(receiver: *mut c_void, selector: *mut c_void, ...) -> *mut c_void;
    }

    let class_name = CString::new("NSData").unwrap();
    let data_class = objc_getClass(class_name.as_ptr());
    let data_selector_name = CString::new("dataWithBytes:length:").unwrap();
    let data_selector = sel_registerName(data_selector_name.as_ptr());
    let data = objc_msgSend(data_class, data_selector, icon_png.as_ptr(), icon_png.len());
    if data.is_null() { return Err("macOS could not load the Dock icon data.".to_string()); }

    let image_class_name = CString::new("NSImage").unwrap();
    let image_class = objc_getClass(image_class_name.as_ptr());
    let alloc_selector_name = CString::new("alloc").unwrap();
    let alloc_selector = sel_registerName(alloc_selector_name.as_ptr());
    let image = objc_msgSend(image_class, alloc_selector);
    let init_selector_name = CString::new("initWithData:").unwrap();
    let init_selector = sel_registerName(init_selector_name.as_ptr());
    let image = objc_msgSend(image, init_selector, data);
    if image.is_null() { return Err("macOS could not decode the Dock icon.".to_string()); }

    let app_class_name = CString::new("NSApplication").unwrap();
    let app_class = objc_getClass(app_class_name.as_ptr());
    let shared_selector_name = CString::new("sharedApplication").unwrap();
    let shared_selector = sel_registerName(shared_selector_name.as_ptr());
    let application = objc_msgSend(app_class, shared_selector);
    let set_selector_name = CString::new("setApplicationIconImage:").unwrap();
    let set_selector = sel_registerName(set_selector_name.as_ptr());
    objc_msgSend(application, set_selector, image);
    Ok(())
}

#[tauri::command]
fn reset_local_data<R: tauri::Runtime>(app: tauri::AppHandle<R>, server: State<'_, StudioServer>, username: String, password: String, server_port: Option<u16>, saved_remote_origins: Vec<String>) -> Result<(), String> {
    let is_dev = cfg!(debug_assertions);
    let managed_port = *server.port.lock().map_err(|_| "ARC Studio server state is unavailable.".to_string())?;
    let port = match (managed_port, server_port) {
        (Some(managed), Some(requested)) if managed != requested => return Err("The local workspace server changed. Restart ARC Studio and try again.".to_string()),
        (Some(managed), _) => managed,
        (None, Some(requested)) if requested > 0 => requested,
        (None, _) => return Err("The local workspace server is unavailable. Restart ARC Studio and try again.".to_string()),
    };
    verify_local_reset_password(port, &username, &password)?;

    for origin in saved_remote_origins {
        delete_workspace_password(origin)?;
    }

    if is_dev { reset_local_workspace_in_dev(port, &username, &password)?; }

    if !is_dev { stop_studio_server(&app); }
    let data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let config_dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    if data_dir.exists() { fs::remove_dir_all(&data_dir).map_err(|error| format!("Could not remove local workspace data: {error}"))?; }
    if config_dir != data_dir && config_dir.exists() { fs::remove_dir_all(&config_dir).map_err(|error| format!("Could not remove local app settings: {error}"))?; }

    thread::spawn(move || {
        thread::sleep(Duration::from_millis(if is_dev { 1800 } else { 500 }));
        app.request_restart();
    });
    Ok(())
}

fn reset_local_workspace_in_dev(port: u16, username: &str, password: &str) -> Result<(), String> {
    let body = format!("{{\"username\":{},\"password\":{}}}", js_string_literal(username), js_string_literal(password));
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(3))
        .map_err(|_| "Could not reach the Tauri development workspace service. Keep `tauri dev` running and try again.".to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(8))).map_err(|error| error.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).map_err(|error| error.to_string())?;
    let request = format!(
        "POST /api/auth/desktop-reset-data HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(), body
    );
    stream.write_all(request.as_bytes()).map_err(|error| error.to_string())?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).map_err(|error| error.to_string())?;
    let response = String::from_utf8_lossy(&response);
    if response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") { Ok(()) }
    else if response.starts_with("HTTP/1.1 401") || response.starts_with("HTTP/1.0 401") { Err("Only the local owner can reset this workspace. Check the owner password and try again.".to_string()) }
    else if response.starts_with("HTTP/1.1 404") || response.starts_with("HTTP/1.0 404") { Err("The Tauri development server does not support workspace reset. Restart `tauri dev` after updating ARC Studio.".to_string()) }
    else { Err("The development server could not reset the workspace data.".to_string()) }
}

fn verify_local_reset_password(port: u16, username: &str, password: &str) -> Result<(), String> {
    let body = format!("{{\"username\":{},\"password\":{}}}", js_string_literal(username), js_string_literal(password));
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(3))
        .map_err(|_| "Could not reach the local workspace to verify your password.".to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).map_err(|error| error.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).map_err(|error| error.to_string())?;
    let request = format!(
        "POST /api/auth/desktop-reset-check HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(), body
    );
    stream.write_all(request.as_bytes()).map_err(|error| error.to_string())?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).map_err(|error| error.to_string())?;
    let response = String::from_utf8_lossy(&response);
    if response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200") { Ok(()) }
    else if response.starts_with("HTTP/1.1 401") || response.starts_with("HTTP/1.0 401") { Err("The ARC Studio password is incorrect.".to_string()) }
    else { Err("Could not verify your ARC Studio password.".to_string()) }
}

fn workspace_credential_entry(origin: &str) -> Result<keyring::Entry, String> {
    let url = url::Url::parse(origin).map_err(|_| "Invalid workspace origin.".to_string())?;
    let local_http = url.scheme() == "http"
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if (url.scheme() != "https" && !local_http)
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Invalid workspace origin.".to_string());
    }
    keyring::Entry::new("studio.arc.desktop", origin)
        .map_err(|error| format!("Could not access the system credential store: {error}"))
}

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

struct StudioServer {
    child: Mutex<Option<Child>>,
    port: Mutex<Option<u16>>,
}
struct DiscordPresence {
    client: Mutex<Option<DiscordIpcClient>>,
    started_at_ms: Mutex<Option<i64>>,
}
struct WindowSizeState(Arc<Mutex<WindowDimensions>>);
#[derive(Clone, Copy)]
struct WindowDimensions { width: f64, height: f64 }
const DISCORD_APPLICATION_ID: &str = "1559947417699360821";
const ARC_GITHUB_URL: &str = "https://github.com/relentiousdragon/arc-studio";

#[tauri::command]
fn update_discord_presence(
    presence: State<'_, DiscordPresence>,
    details: String,
    state_text: String,
    activity_type: u8,
) -> Result<(), String> {
    let details = presence_text(&details);
    let state_text = presence_text(&state_text);
    let activity_type = match activity_type {
        0 => activity::ActivityType::Playing,
        2 => activity::ActivityType::Listening,
        3 => activity::ActivityType::Watching,
        5 => activity::ActivityType::Competing,
        _ => return Err("Choose a supported Discord activity type.".to_string()),
    };
    let started_at_ms = {
        let mut started_at = presence.started_at_ms.lock().map_err(|_| "Discord presence is unavailable.".to_string())?;
        *started_at.get_or_insert_with(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64
        })
    };
    let mut connection = presence.client.lock().map_err(|_| "Discord presence is unavailable.".to_string())?;
    if connection.is_none() {
        let mut client = DiscordIpcClient::new(DISCORD_APPLICATION_ID);
        client.connect().map_err(|_| "Discord is not running or its local RPC connection is unavailable.".to_string())?;
        *connection = Some(client);
    }
    let client = connection.as_mut().expect("connection was initialized");
    let activity = activity::Activity::new()
        .name("ARC Studio")
        .activity_type(activity_type)
        .details(details)
        .state(state_text)
        .timestamps(activity::Timestamps::new().start(started_at_ms))
        .buttons(vec![activity::Button::new("GitHub", ARC_GITHUB_URL)]);
    if client.set_activity(activity).is_err() {
        if let Some(mut client) = connection.take() {
            let _ = client.close();
        }
        return Err("Discord closed the Rich Presence connection. ARC Studio will retry.".to_string());
    }
    Ok(())
}

#[tauri::command]
fn clear_discord_presence(presence: State<'_, DiscordPresence>) {
    clear_discord_presence_inner(&presence);
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "Invalid external URL.".to_string())?;
    if parsed.scheme() != "https"
        || !matches!(parsed.host_str(), Some("github.com" | "www.github.com"))
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Only ARC Studio GitHub links can be opened here.".to_string());
    }

    let mut command = if cfg!(target_os = "macos") {
        Command::new("open")
    } else if cfg!(target_os = "windows") {
        let mut command = Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler");
        command
    } else {
        Command::new("xdg-open")
    };
    command.arg(parsed.as_str());
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the external link: {error}"))
}

fn clear_discord_presence_inner(presence: &DiscordPresence) {
    if let Ok(mut connection) = presence.client.lock() {
        if let Some(mut client) = connection.take() {
            let _ = client.clear_activity();
            let _ = client.close();
        }
    }
    if let Ok(mut started_at) = presence.started_at_ms.lock() {
        *started_at = None;
    }
}

fn presence_text(value: &str) -> String {
    value.chars().filter(|character| !character.is_control()).take(128).collect()
}

fn main() {
    #[cfg(target_os = "windows")]
    if !windows_10_or_newer() {
        show_windows_10_required_message();
        return;
    }
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_workspace_password,
            save_workspace_password,
            delete_workspace_password,
            set_release_channel_icon,
            read_arc_project_file,
            save_project_export,
            open_project_window,
            reset_local_data,
            open_external_url,
            update_discord_presence,
            clear_discord_presence
        ])
        .manage(StudioServer { child: Mutex::new(None), port: Mutex::new(None) })
        .manage(DiscordPresence {
            client: Mutex::new(None),
            started_at_ms: Mutex::new(None),
        })
        .setup(|app| {
            let window_config = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "ARC Studio window configuration is missing"))?;
            let config_dir = app.path().app_config_dir()?;
            fs::create_dir_all(&config_dir)?;
            let window_size_path = config_dir.join("window-size.txt");
            let window_size = restore_window_size(app, &window_config, &window_size_path);
            let (api_base_url, startup_error) = if !cfg!(debug_assertions) {
                match start_studio_server(app) {
                    Ok(url) => (Some(url), None),
                    Err(error) => {
                        eprintln!("ARC Studio local service failed to start: {error}");
                        (None, Some(format!("{error} Check desktop-server-process.log in the app logs folder for details.")))
                    }
                }
            } else {
                (None, None)
            };
            let mut window = WebviewWindowBuilder::from_config(app.handle(), &window_config)?
                .inner_size(window_size.width, window_size.height);
            let local_username = os_login_name();
            let api_base_url = api_base_url
                .as_deref()
                .map(js_string_literal)
                .unwrap_or_else(|| "null".to_string());
            let startup_error = startup_error
                .as_deref()
                .map(js_string_literal)
                .unwrap_or_else(|| "null".to_string());
            let platform = if cfg!(target_os = "macos") { "macos" } else if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "linux") { "linux" } else { "other" };
            let desktop_target = option_env!("ARC_DESKTOP_TARGET")
                .map(str::to_owned)
                .unwrap_or_else(|| format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS));
            let startup_project_files = std::env::args_os().skip(1)
                .map(PathBuf::from)
                .filter(|path| is_arc_project_path(path))
                .map(|path| js_string_literal(&path.to_string_lossy()))
                .collect::<Vec<_>>()
                .join(",");
            let startup_args = std::env::args_os().skip(1).collect::<Vec<_>>();
            let startup_project_id = startup_args.windows(2)
                .find(|pair| pair[0] == "--arc-project-id")
                .and_then(|pair| pair[1].to_str())
                .filter(|id| id.strip_prefix("project_").is_some_and(|uuid| uuid.len() == 36))
                .map(js_string_literal)
                .unwrap_or_else(|| "null".to_string());
            let init_script = format!(
                "window.__ARC_STUDIO_CONFIG__ = Object.freeze({{ desktop: true, platform: {}, target: {}, localUsername: {}, apiBaseUrl: {}, startupError: {}, startupProjectId: {} }}); window.__ARC_STUDIO_OPEN_PROJECT_FILES__ = [{}];",
                js_string_literal(platform),
                js_string_literal(&desktop_target),
                js_string_literal(&local_username),
                api_base_url,
                startup_error,
                startup_project_id,
                startup_project_files
            );
            window = window.initialization_script(init_script);

            let window = window.build()?;
            let window_dimensions = Arc::new(Mutex::new(window_size));
            app.manage(WindowSizeState(window_dimensions.clone()));
            let app_handle = app.handle().clone();
            let window_label = window_config.label.clone();
            let save_path = window_size_path.clone();
            window.on_window_event(move |event| {
                let next_size = match event {
                    WindowEvent::Resized(size) => Some((size.width, size.height, None)),
                    WindowEvent::ScaleFactorChanged { scale_factor, new_inner_size, .. } => Some((new_inner_size.width, new_inner_size.height, Some(*scale_factor))),
                    WindowEvent::CloseRequested { .. } => {
                        save_window_dimensions(&save_path, &window_dimensions);
                        None
                    }
                    _ => None,
                };
                let Some((width, height, event_scale_factor)) = next_size else { return; };
                let Some(window) = app_handle.get_webview_window(&window_label) else { return; };
                if window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) { return; }
                let scale_factor = event_scale_factor.unwrap_or_else(|| window.scale_factor().unwrap_or(1.0));
                let logical_width = width as f64 / scale_factor;
                let logical_height = height as f64 / scale_factor;
                let fills_monitor = window.current_monitor().ok().flatten().is_some_and(|monitor| {
                    let monitor_scale = monitor.scale_factor().max(1.0);
                    let monitor_width = monitor.size().width as f64 / monitor_scale;
                    let monitor_height = monitor.size().height as f64 / monitor_scale;
                    logical_width >= monitor_width * 0.88 && logical_height >= monitor_height * 0.82
                });
                if fills_monitor { return; }
                if let Ok(mut dimensions) = window_dimensions.lock() {
                    dimensions.width = logical_width;
                    dimensions.height = logical_height;
                }
                save_window_dimensions(&save_path, &window_dimensions);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build ARC Studio desktop");

    app.run(|app, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            for url in urls {
                if let Ok(path) = url.to_file_path() { notify_project_file_opened(app, &path); }
            }
        }
        RunEvent::Exit => {
            clear_discord_presence_inner(&app.state::<DiscordPresence>());
            if let (Ok(config_dir), Some(window_size)) = (app.path().app_config_dir(), app.try_state::<WindowSizeState>()) {
                save_window_dimensions(&config_dir.join("window-size.txt"), &window_size.0);
            }
            stop_studio_server(app);
        }
        _ => {}
    });
}

#[cfg(target_os = "windows")]
fn windows_10_or_newer() -> bool {
    #[repr(C)]
    struct OsVersionInfo {
        size: u32,
        major: u32,
        minor: u32,
        build: u32,
        platform: u32,
        service_pack: [u16; 128],
        service_pack_major: u16,
        service_pack_minor: u16,
        suite_mask: u16,
        product_type: u8,
        reserved: u8,
    }
    #[link(name = "ntdll")]
    unsafe extern "system" { fn RtlGetVersion(version: *mut OsVersionInfo) -> i32; }
    let mut version = OsVersionInfo {
        size: std::mem::size_of::<OsVersionInfo>() as u32,
        major: 0,
        minor: 0,
        build: 0,
        platform: 0,
        service_pack: [0; 128],
        service_pack_major: 0,
        service_pack_minor: 0,
        suite_mask: 0,
        product_type: 0,
        reserved: 0,
    };
    unsafe {
        RtlGetVersion(&mut version) == 0
            && (version.major > 10 || (version.major == 10 && version.build >= 17134))
    }
}

#[cfg(target_os = "windows")]
fn show_windows_10_required_message() {
    const MB_ICONERROR: u32 = 0x00000010;
    const MB_OK: u32 = 0x00000000;
    let text: Vec<u16> = "ARC Studio requires Windows 10 version 1803 (build 17134) or newer, including Windows 11.".encode_utf16().chain(Some(0)).collect();
    let title: Vec<u16> = "ARC Studio".encode_utf16().chain(Some(0)).collect();
    #[link(name = "user32")]
    unsafe extern "system" { fn MessageBoxW(window: *mut std::ffi::c_void, text: *const u16, title: *const u16, kind: u32) -> i32; }
    unsafe { MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), MB_ICONERROR | MB_OK); }
}

fn restore_window_size<R: tauri::Runtime>(app: &tauri::App<R>, config: &tauri::utils::config::WindowConfig, path: &Path) -> WindowDimensions {
    let minimum_width = config.min_width.unwrap_or(560.0);
    let minimum_height = config.min_height.unwrap_or(420.0);
    let monitor_bounds = app.primary_monitor().ok().flatten().map(|monitor| {
        let scale = monitor.scale_factor().max(1.0);
        (monitor.size().width as f64 / scale, monitor.size().height as f64 / scale)
    });
    let maximum_width = config.max_width.or_else(|| monitor_bounds.map(|bounds| bounds.0)).unwrap_or(10000.0).max(minimum_width);
    let maximum_height = config.max_height.or_else(|| monitor_bounds.map(|bounds| bounds.1)).unwrap_or(10000.0).max(minimum_height);
    let saved = fs::read_to_string(path).ok().and_then(|contents| {
        let mut values = contents.split_whitespace();
        let width = values.next()?.parse::<f64>().ok()?;
        let height = values.next()?.parse::<f64>().ok()?;
        if values.next().is_some() || !width.is_finite() || !height.is_finite() { return None; }
        Some(WindowDimensions { width, height })
    });
    let saved = saved.unwrap_or(WindowDimensions { width: config.width, height: config.height });
    WindowDimensions {
        width: saved.width.clamp(minimum_width, maximum_width),
        height: saved.height.clamp(minimum_height, maximum_height),
    }
}

fn save_window_dimensions(path: &Path, dimensions: &Arc<Mutex<WindowDimensions>>) {
    let Some(parent) = path.parent() else { return; };
    if fs::create_dir_all(parent).is_err() { return; }
    if let Ok(dimensions) = dimensions.lock() {
        let _ = fs::write(path, format!("{:.0} {:.0}", dimensions.width, dimensions.height));
    }
}

fn os_login_name() -> String {
    let raw_name = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_default();
    let safe_name = raw_name
        .trim()
        .chars()
        .filter(|character| !character.is_control())
        .take(32)
        .collect::<String>();
    if safe_name.len() >= 2 {
        safe_name
    } else {
        "Admin".to_string()
    }
}

fn js_string_literal(value: &str) -> String {
    let mut escaped = String::from("\"");
    for character in value.chars() {
        match character {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            character if character.is_control() || matches!(character, '\u{2028}' | '\u{2029}') => {
                escaped.push_str(&format!("\\u{:04x}", character as u32));
            }
            character => escaped.push(character),
        }
    }
    escaped.push('"');
    escaped
}

fn start_studio_server<R: tauri::Runtime>(
    app: &mut tauri::App<R>,
) -> Result<String, Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    let runtime_dir = resource_dir.join("resources/runtime");
    let app_root = runtime_dir.join("app");
    let node_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };
    let node_path = runtime_dir.join(node_name);
    let entry_path = app_root.join("packages/studio-server/src/index.js");
    if !node_path.is_file() || !entry_path.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "ARC Studio desktop runtime is incomplete. Rebuild the desktop package.",
        )
        .into());
    }

    let data_dir = app.path().app_data_dir()?;
    let config_dir = app.path().app_config_dir()?;
    let logs_dir = data_dir.join("logs");
    fs::create_dir_all(&data_dir)?;
    fs::create_dir_all(&config_dir)?;
    fs::create_dir_all(&logs_dir)?;
    #[cfg(unix)]
    {
        fs::set_permissions(&data_dir, fs::Permissions::from_mode(0o700))?;
        fs::set_permissions(&config_dir, fs::Permissions::from_mode(0o700))?;
        fs::set_permissions(&logs_dir, fs::Permissions::from_mode(0o700))?;
    }

    let port_file = config_dir.join(format!("server-{}.port", std::process::id()));
    let _ = fs::remove_file(&port_file);
    let server_log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs_dir.join("desktop-server-process.log"))?;
    let server_error_log = server_log.try_clone()?;
    let bot_token_key = bot_token_encryption_key()
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    let mut child = Command::new(node_path)
        .arg(entry_path)
        .current_dir(&app_root)
        .env("ARC_DESKTOP_MODE", "1")
        .env("ARC_DATA_DIR", &data_dir)
        .env("ARC_LOG_DIR", &logs_dir)
        .env("ARC_ENV_FILE", config_dir.join("studio.env"))
        .env("ARC_BOT_TOKEN_ENCRYPTION_KEY", bot_token_key)
        .env("ARC_PORT_FILE", &port_file)
        .env(
            "ARC_CORS_ORIGINS",
            "tauri://localhost,http://tauri.localhost",
        )
        .env("HOST", "127.0.0.1")
        .env("PORT", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::from(server_log))
        .stderr(Stdio::from(server_error_log))
        .spawn()?;

    let port = match wait_for_server_port(&mut child, &port_file) {
        Ok(port) => port,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error.into());
        }
    };
    let _ = fs::remove_file(port_file);
    let server_state = app.state::<StudioServer>();
    let mut server = server_state.child.lock().map_err(|_| {
        io::Error::new(
            io::ErrorKind::Other,
            "ARC Studio server state is unavailable.",
        )
    })?;
    *server = Some(child);
    *server_state.port.lock().map_err(|_| io::Error::new(io::ErrorKind::Other, "ARC Studio server state is unavailable."))? = Some(port);
    Ok(format!("http://127.0.0.1:{port}"))
}

fn wait_for_server_port(
    child: &mut Child,
    port_file: &Path,
) -> Result<u16, Box<dyn std::error::Error>> {
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if let Some(status) = child.try_wait()? {
            return Err(io::Error::new(
                io::ErrorKind::Other,
                format!("ARC Studio server exited during startup ({status})."),
            )
            .into());
        }
        if let Ok(value) = fs::read_to_string(port_file) {
            if let Ok(port) = value.trim().parse::<u16>() {
                if port > 0 {
                    return Ok(port);
                }
            }
        }
        thread::sleep(Duration::from_millis(50));
    }
    Err(io::Error::new(
        io::ErrorKind::TimedOut,
        "ARC Studio server did not start within 20 seconds.",
    )
    .into())
}

fn stop_studio_server<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let server_state = app.state::<StudioServer>();
    let Ok(mut server) = server_state.child.lock() else {
        return;
    };
    let Some(mut child) = server.take() else {
        return;
    };
    if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(b"ARC_STUDIO_SHUTDOWN\n");
        let _ = stdin.flush();
    }
    let deadline = Instant::now() + Duration::from_secs(4);
    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => break,
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}
