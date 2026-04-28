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
    
    // 버튼 창 노출 여부 결정
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

            // 초기 위치 설정
            if let Ok(Some(monitor)) = main_win.primary_monitor() {
                let factor = monitor.scale_factor();
                let size = monitor.size();
                let x = (size.width as f64 / factor) - 170.0;
                let y = (size.height as f64 / factor) - 170.0;
                let _ = main_win.set_position(LogicalPosition::new(x, y));
                let _ = btn_win.set_position(LogicalPosition::new(x + 100.0, y + 100.0));
            }

            let win = main_win.clone();
            let bwin = btn_win.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = time::interval(Duration::from_millis(16));
                let mut curr_x: f64 = 0.0;
                let mut curr_y: f64 = 0.0;
                let mut is_init = false;

                loop {
                    interval.tick().await;
                    let following = IS_FOLLOWING_INTERNAL.load(Ordering::SeqCst);

                    if !following {
                        // 중요: 쉬고 있을 때는 버튼 창이 고양이 위치와 완벽히 일치하게 함
                        if let Ok(pos) = win.outer_position() {
                            if let Ok(Some(m)) = win.primary_monitor() {
                                let f = m.scale_factor();
                                curr_x = pos.x as f64 / f;
                                curr_y = pos.y as f64 / f;
                                // 오프셋 없이 고양이 창 위치 그대로 버튼을 배치
                                let _ = bwin.set_position(LogicalPosition::new(curr_x, curr_y));
                            }
                        }
                        is_init = false;
                        continue;
                    }

                    // 팔로잉 진입 시 좌표 초기화
                    if !is_init {
                        if let Ok(pos) = win.outer_position() {
                            if let Ok(Some(m)) = win.primary_monitor() {
                                curr_x = pos.x as f64 / m.scale_factor();
                                curr_y = pos.y as f64 / m.scale_factor();
                                if curr_x > 0.1 { is_init = true; }
                            }
                        }
                        if !is_init { continue; }
                    }

                    // 팔로잉 중에는 버튼 창(bwin)을 건드리지 않음 -> 버튼이 그 자리에 고정됨

                    let mut target_x = curr_x;
                    let mut target_y = curr_y;

                    #[cfg(target_os = "macos")]
                    {
                        use core_graphics::event::CGEvent;
                        use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
                        if let Ok(src) = CGEventSource::new(CGEventSourceStateID::CombinedSessionState) {
                            if let Ok(evt) = CGEvent::new(src) {
                                let p = evt.location();
                                target_x = p.x + 20.0; target_y = p.y + 20.0;
                            }
                        }
                    }

                    #[cfg(target_os = "windows")]
                    {
                        if let Ok(pos) = mouse_position::mouse::get_mouse_position() {
                            if let Ok(Some(m)) = win.primary_monitor() {
                                target_x = pos.x as f64 / m.scale_factor() + 20.0;
                                target_y = pos.y as f64 / m.scale_factor() + 20.0;
                            }
                        }
                    }

                    let dx = target_x - curr_x;
                    let dy = target_y - curr_y;
                    
                    if dx.abs() > 1.0 || dy.abs() > 1.0 {
                        curr_x += dx * 0.08;
                        curr_y += dy * 0.08;
                        let _ = win.set_position(LogicalPosition::new(curr_x, curr_y));
                        let _ = win.emit("cat-move-state", serde_json::json!({"is_moving": true, "facing_right": dx > 0.0}));
                    } else {
                        let _ = win.emit("cat-move-state", serde_json::json!({"is_moving": false, "facing_right": dx > 0.0}));
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
