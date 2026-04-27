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

// 백엔드에서 직접 관리하는 상태들
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
    
    // 현재 활성 일정이 있고, 그 일정이 수동 취침 목록에 없다면 팔로잉 활성화
    let should_follow = if let Some(curr) = &*current_id {
        if let Some(slept) = &*slept_id {
            curr != slept
        } else {
            true
        }
    } else {
        false
    };

    IS_FOLLOWING_INTERNAL.store(should_follow, Ordering::SeqCst);

    if let Some(btn_win) = app.get_webview_window("sleep-button") {
        if should_follow { let _ = btn_win.show(); }
        else { let _ = btn_win.hide(); }
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

            // 재우기 버튼 위치를 화면 우측 하단에서 더 위/왼쪽으로 이동
            if let Ok(Some(monitor)) = main_win.primary_monitor() {
                let screen_size = monitor.size().to_logical::<f64>(monitor.scale_factor());
                let _ = btn_win.set_position(LogicalPosition::new(
                    screen_size.width - 120.0,
                    screen_size.height - 80.0
                ));
            }

            let win = main_win.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = time::interval(Duration::from_millis(16));
                let mut current_x = 0.0;
                let mut current_y = 0.0;
                let mut last_x = 0.0;
                let mut last_y = 0.0;
                let mut last_facing_right = false;
                let mut last_moving_state = false;

                loop {
                    interval.tick().await;
                    let following = IS_FOLLOWING_INTERNAL.load(Ordering::SeqCst);
                    
                    #[cfg(target_os = "macos")]
                    {
                        use core_graphics::event::CGEvent;
                        use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
                        
                        let mut is_moving = false;
                        let mut facing_right = last_facing_right;
                        let target_x;
                        let target_y;

                        if following {
                            if let Ok(source) = CGEventSource::new(CGEventSourceStateID::CombinedSessionState) {
                                if let Ok(event) = CGEvent::new(source) {
                                    let point = event.location();
                                    target_x = point.x + 20.0; 
                                    target_y = point.y + 20.0;
                                } else { continue; }
                            } else { continue; }
                        } else {
                            if let Ok(Some(monitor)) = win.primary_monitor() {
                                let scale_factor = monitor.scale_factor();
                                let size = monitor.size();
                                // 물리적 크기를 논리적 크기로 변환
                                let screen_width = size.width as f64 / scale_factor;
                                let screen_height = size.height as f64 / scale_factor;

                                // 고양이가 화면 우측 하단 구석에 위치하도록 설정 (충분한 여백 확보)
                                target_x = screen_width - 160.0;
                                target_y = screen_height - 160.0;
                            } else { 
                                // 모니터 정보를 가져오지 못할 경우 기본값 사용 (일반적인 해상도 기준)
                                target_x = 1600.0;
                                target_y = 900.0;
                            }
                        }


                        if current_x == 0.0 && current_y == 0.0 {
                            current_x = target_x; current_y = target_y;
                        }

                        let dx = target_x - current_x;
                        let dy = target_y - current_y;
                        
                        // 이동 판정 기준: 홈으로 돌아가는 중에도 '이동 중'임
                        // 홈(target_x, target_y)에 거의 다 왔을 때만 정지로 간주
                        if dx.abs() > 1.5 || dy.abs() > 1.5 {
                            is_moving = true;
                            if dx > 0.0 { facing_right = true; } 
                            else if dx < 0.0 { facing_right = false; }
                        }

                        let lerp_factor = if following { 0.08 } else { 0.05 };
                        current_x += dx * lerp_factor;
                        current_y += dy * lerp_factor;

                        let _ = win.set_position(LogicalPosition::new(current_x, current_y));

                        // 프론트엔드 상태 업데이트 전송 최적화
                        if is_moving != last_moving_state || facing_right != last_facing_right || (current_x - last_x).abs() > 2.0 || (current_y - last_y).abs() > 2.0 {
                            #[derive(serde::Serialize, Clone)]
                            struct MovePayload { is_moving: bool, facing_right: bool }
                            let _ = win.emit("cat-move-state", MovePayload { is_moving, facing_right });
                            last_moving_state = is_moving;
                            last_facing_right = facing_right;
                            last_x = current_x;
                            last_y = current_y;
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
