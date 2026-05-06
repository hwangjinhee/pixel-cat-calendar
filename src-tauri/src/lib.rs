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
    
    let is_slept = if let (Some(curr), Some(slept)) = (&*current_id, &*slept_id) {
        curr == slept
    } else { false };

    let should_follow = current_id.is_some() && !is_slept;
    IS_FOLLOWING_INTERNAL.store(should_follow, Ordering::SeqCst);
    
    if let Some(btn_win) = app.get_webview_window("sleep-button") {
        if current_id.is_some() { let _ = btn_win.show(); } else { let _ = btn_win.hide(); }
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
fn reset_manual_sleep() {
    let mut slept_id = SLEPT_EVENT_ID.lock().unwrap();
    *slept_id = None;
}

#[tauri::command]
fn is_waiting_active() -> bool {
    let current_id = CURRENT_ACTIVE_EVENT_ID.lock().unwrap();
    let slept_id = SLEPT_EVENT_ID.lock().unwrap();
    if let (Some(curr), Some(slept)) = (&*current_id, &*slept_id) {
        curr == slept
    } else { false }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .invoke_handler(tauri::generate_handler![
            get_all_events, sync_state, mark_manual_sleep, reset_manual_sleep, is_waiting_active,
            calendar::google::google_login, calendar::google::google_logout, calendar::google::is_google_logged_in
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
                let mut curr_x = 0.0;
                let mut curr_y = 0.0;
                let mut is_init = false;
                let mut last_state_payload = String::new();

                loop {
                    interval.tick().await;
                    let following = IS_FOLLOWING_INTERNAL.load(Ordering::SeqCst);
                    let is_manual_waiting = {
                        let current_id = CURRENT_ACTIVE_EVENT_ID.lock().unwrap();
                        let slept_id = SLEPT_EVENT_ID.lock().unwrap();
                        if let (Some(curr), Some(slept)) = (&*current_id, &*slept_id) { curr == slept } else { false }
                    };
                    let has_any_event = CURRENT_ACTIVE_EVENT_ID.lock().unwrap().is_some();

                    // 1. 윈도우 클릭 투과/허용 정밀 제어
                    #[cfg(target_os = "windows")]
                    {
                        use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
                        use windows_sys::Win32::Foundation::POINT;
                        let mut p = POINT { x: 0, y: 0 };
                        unsafe {
                            if GetCursorPos(&mut p) != 0 {
                                if let Ok(win_pos) = win.outer_position() {
                                    if let Ok(Some(m)) = win.current_monitor() {
                                        let f = m.scale_factor();
                                        let dx = (p.x as f64 - win_pos.x as f64) / f;
                                        let dy = (p.y as f64 - win_pos.y as f64) / f;
                                        
                                        // [핵심 수정] 상태에 따라 클릭 방해 영역을 동적으로 제한
                                        // 취침 모드(!following && !is_manual_waiting && !has_any_event)일 때는 높이를 150px로 제한
                                        let max_clickable_dy = if following || is_manual_waiting || has_any_event { 350.0 } else { 150.0 };
                                        
                                        let is_inside = dx >= 0.0 && dx <= 150.0 && dy >= 0.0 && dy <= max_clickable_dy;
                                        let _ = win.set_ignore_cursor_events(!is_inside);
                                    }
                                }
                            }
                        }
                    }

                    if !following {
                        if let Ok(pos) = win.outer_position() {
                            if let Ok(Some(m)) = win.current_monitor() {
                                let f = m.scale_factor();
                                curr_x = pos.x as f64 / f;
                                curr_y = pos.y as f64 / f;
                                let _ = bwin.set_position(LogicalPosition::new(curr_x - 80.0, curr_y - 30.0));
                            }
                        }
                        let _ = bwin.set_ignore_cursor_events(!is_manual_waiting);
                        let state = if is_manual_waiting { "SITTING" } else if !has_any_event { "SLEEPING" } else { "SITTING" };
                        let payload = serde_json::json!({"state": state, "facing_right": false}).to_string();
                        if payload != last_state_payload {
                            let _ = win.emit("cat-state", serde_json::json!({"state": state, "facing_right": false}));
                            last_state_payload = payload;
                        }
                        is_init = false;
                        continue;
                    }
                    
                    let _ = bwin.set_ignore_cursor_events(false);

                    if let Ok(Some(m)) = win.current_monitor() {
                        let f = m.scale_factor();
                        if !is_init {
                            if let Ok(pos) = win.outer_position() {
                                curr_x = pos.x as f64 / f; curr_y = pos.y as f64 / f;
                                if curr_x > 0.1 { is_init = true; }
                            }
                        }
                        
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
                                    target_x = point.x as f64 / f + 20.0;
                                    target_y = point.y as f64 / f + 20.0;
                                }
                            }
                        }

                        let dx = target_x - curr_x;
                        let dy = target_y - curr_y;
                        let is_actually_moving = dx.abs() > 1.5 || dy.abs() > 1.5;
                        let facing_right = dx > 0.0;

                        curr_x += dx * 0.08; curr_y += dy * 0.08;
                        let _ = win.set_position(LogicalPosition::new(curr_x, curr_y));

                        let state = if is_actually_moving { "WALKING" } else { "SITTING" };
                        let payload = serde_json::json!({"state": state, "facing_right": facing_right}).to_string();
                        if payload != last_state_payload {
                            let _ = win.emit("cat-state", serde_json::json!({"state": state, "facing_right": facing_right}));
                            last_state_payload = payload;
                        }
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
