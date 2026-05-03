mod calendar;

use calendar::CalendarEvent;
use tauri::{Manager, Emitter, LogicalPosition};
use std::time::Duration;
use tokio::time;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use once_cell::sync::Lazy;

#[cfg(target_os = "macos")]
#[allow(deprecated)]
use cocoa::appkit::NSWindow;
#[cfg(target_os = "macos")]
#[allow(deprecated)]
use cocoa::base::id;

#[cfg(target_os = "macos")]
#[allow(non_upper_case_globals)]
const NSStatusWindowLevel: i64 = 25; 

static IS_FOLLOWING_INTERNAL: AtomicBool = AtomicBool::new(false);
static CURRENT_ACTIVE_EVENT_ID: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));
static SLEPT_EVENT_ID: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

#[tauri::command]
async fn get_all_events() -> Result<Vec<CalendarEvent>, String> {
    let mut all_events = Vec::new();
    if let Ok(events) = calendar::google::fetch_google_events().await { all_events.extend(events); }
    if let Ok(events) = calendar::outlook::fetch_outlook_events().await { all_events.extend(events); }
    #[cfg(target_os = "macos")]
    { if let Ok(events) = calendar::apple::fetch_apple_events() { all_events.extend(events); } }
    all_events.sort_by(|a, b| a.start_time.cmp(&b.start_time));
    Ok(all_events)
}

#[tauri::command]
fn sync_state(app: tauri::AppHandle, event_id: Option<String>) {
    let mut current_id = CURRENT_ACTIVE_EVENT_ID.lock().unwrap();
    *current_id = event_id.clone();
    let slept_id = SLEPT_EVENT_ID.lock().unwrap();
    let should_follow = if let Some(curr) = &*current_id {
        if let Some(slept) = &*slept_id { curr != slept } else { true }
    } else { false };
    IS_FOLLOWING_INTERNAL.store(should_follow, Ordering::SeqCst);
    if let Some(btn_win) = app.get_webview_window("sleep-button") {
        if should_follow { let _ = btn_win.show(); } else { let _ = btn_win.hide(); }
    }
}

#[tauri::command]
fn mark_manual_sleep() {
    let current_id = CURRENT_ACTIVE_EVENT_ID.lock().unwrap();
    if let Some(id) = &*current_id {
        let mut slept_id = SLEPT_EVENT_ID.lock().unwrap();
        *slept_id = Some(id.clone());
        IS_FOLLOWING_INTERNAL.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
fn log_message(msg: String) {
    println!("[BACKEND LOG] {}", msg);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .invoke_handler(tauri::generate_handler![
            get_all_events, 
            sync_state, 
            mark_manual_sleep,
            log_message,
            calendar::google::google_login,
            calendar::google::google_logout,
            calendar::google::is_google_logged_in
        ])
        .setup(|app| {
            let main_win = app.get_webview_window("main").unwrap();
            let btn_win = app.get_webview_window("sleep-button").unwrap();

            #[cfg(target_os = "macos")]
            #[allow(deprecated)]
            {
                let ns_main = main_win.ns_window().unwrap() as id;
                let ns_btn = btn_win.ns_window().unwrap() as id;
                unsafe {
                    ns_main.setLevel_(NSStatusWindowLevel);
                    ns_btn.setLevel_(NSStatusWindowLevel + 1);
                }
            }

            let win = main_win.clone();
            let bwin = btn_win.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = time::interval(Duration::from_millis(16));
                let initial_pos = win.outer_position().unwrap_or_default();
                let factor = win.current_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
                let (mut curr_x, mut curr_y) = (initial_pos.x as f64 / factor, initial_pos.y as f64 / factor);
                let (mut last_facing_right, mut last_moving) = (false, false);

                loop {
                    interval.tick().await;
                    let following = IS_FOLLOWING_INTERNAL.load(Ordering::SeqCst);

                    // 1. 백엔드 레벨의 마우스 투과 처리 (윈도우 전용)
                    #[cfg(target_os = "windows")]
                    {
                        use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
                        use windows_sys::Win32::Foundation::POINT;
                        let mut p = POINT { x: 0, y: 0 };
                        unsafe {
                            if GetCursorPos(&mut p) != 0 {
                                if let Ok(win_pos) = win.outer_position() {
                                    let dx = (p.x as f64 - win_pos.x as f64).abs();
                                    let dy = (p.y as f64 - win_pos.y as f64).abs();
                                    // 창 중앙(고양이 위치) 근처일 때만 클릭 활성화 (약 150px 범위)
                                    let _ = win.set_ignore_cursor_events(dx > 150.0 || dy > 200.0);
                                }
                            }
                        }
                    }

                    if !following {
                        if let Ok(pos) = win.outer_position() {
                            if let Ok(Some(m)) = win.primary_monitor() {
                                let f = m.scale_factor();
                                curr_x = pos.x as f64 / f;
                                curr_y = pos.y as f64 / f;
                                let _ = bwin.set_position(LogicalPosition::new(curr_x, curr_y));
                                let _ = bwin.set_ignore_cursor_events(true);
                            }
                        }
                        if last_moving {
                            let _ = win.emit("cat-move-state", serde_json::json!({"is_moving": false, "facing_right": last_facing_right}));
                            last_moving = false;
                        }
                        continue;
                    }
                    
                    let _ = bwin.set_ignore_cursor_events(false);

                    let mut target_x = curr_x;
                    let mut target_y = curr_y;

                    #[cfg(target_os = "macos")]
                    {
                        use core_graphics::event::CGEvent;
                        use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
                        if let Ok(src) = CGEventSource::new(CGEventSourceStateID::CombinedSessionState) {
                            if let Ok(evt) = CGEvent::new(src) {
                                let p: core_graphics::geometry::CGPoint = evt.location();
                                target_x = p.x + 20.0; target_y = p.y + 20.0;
                            }
                        }
                    }

                    #[cfg(target_os = "windows")]
                    {
                        use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
                        use windows_sys::Win32::Foundation::POINT;
                        let mut point = POINT { x: 0, y: 0 };
                        unsafe {
                            if GetCursorPos(&mut point) != 0 {
                                if let Ok(Some(m)) = win.primary_monitor() {
                                    target_x = point.x as f64 / m.scale_factor() + 20.0;
                                    target_y = point.y as f64 / m.scale_factor() + 20.0;
                                }
                            }
                        }
                    }

                    let dx = target_x - curr_x;
                    let dy = target_y - curr_y;
                    let is_moving = dx.abs() > 1.5 || dy.abs() > 1.5;
                    let facing_right = if dx > 0.0 { true } else if dx < 0.0 { false } else { last_facing_right };

                    curr_x += dx * 0.08;
                    curr_y += dy * 0.08;
                    let _ = win.set_position(LogicalPosition::new(curr_x, curr_y));

                    if is_moving != last_moving || facing_right != last_facing_right {
                        let _ = win.emit("cat-move-state", serde_json::json!({"is_moving": is_moving, "facing_right": facing_right}));
                        last_moving = is_moving;
                        last_facing_right = facing_right;
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
