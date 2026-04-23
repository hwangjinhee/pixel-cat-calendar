mod calendar;

use calendar::CalendarEvent;
use tauri::{Manager, Emitter};
#[cfg(target_os = "macos")]
use tauri::LogicalPosition;
use std::time::Duration;
use tokio::time;
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "macos")]
use cocoa::appkit::{NSWindow, NSApp, NSImage, NSApplication};
#[cfg(target_os = "macos")]
use cocoa::base::{id, nil};
#[cfg(target_os = "macos")]
use cocoa::foundation::NSString;

#[cfg(target_os = "macos")]
#[allow(non_upper_case_globals)]
const NSStatusWindowLevel: i64 = 25; 

static IS_FOLLOWING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
async fn google_login(app: tauri::AppHandle) -> Result<String, String> {
    calendar::google::login(app).await
}

#[tauri::command]
async fn get_all_events() -> Result<Vec<CalendarEvent>, String> {
    println!("--- Fetching all events ---");
    let mut all_events = Vec::new();

    if let Ok(events) = calendar::google::fetch_google_events().await {
        all_events.extend(events);
    }

    if let Ok(events) = calendar::outlook::fetch_outlook_events().await {
        all_events.extend(events);
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(events) = calendar::apple::fetch_apple_events() {
            all_events.extend(events);
        }
    }

    all_events.sort_by(|a, b| a.start_time.cmp(&b.start_time));
    Ok(all_events)
}

#[tauri::command]
fn set_cat_following(following: bool) {
    IS_FOLLOWING.store(following, Ordering::Relaxed);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .invoke_handler(tauri::generate_handler![get_all_events, google_login, set_cat_following])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            {
                let ns_window = window.ns_window().unwrap() as id;
                unsafe {
                    ns_window.setLevel_(NSStatusWindowLevel);
                    window.set_ignore_cursor_events(false).unwrap();

                    let icon_path = app.path().resource_dir().unwrap().join("icons/icon.icns");
                    if icon_path.exists() {
                        let ns_path = NSString::alloc(nil).init_str(icon_path.to_str().unwrap());
                        let image = NSImage::alloc(nil).initWithContentsOfFile_(ns_path);
                        if image != nil {
                            NSApp().setApplicationIconImage_(image);
                        }
                    }
                }
            }

            let win = window.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = time::interval(Duration::from_millis(16));
                #[cfg(target_os = "macos")]
                let mut current_x = 0.0;
                #[cfg(target_os = "macos")]
                let mut current_y = 0.0;
                #[cfg(target_os = "macos")]
                let mut vel_x = 0.0;
                #[cfg(target_os = "macos")]
                let mut vel_y = 0.0;

                let mut last_moving_state = false;
                let mut last_facing_right = false;

                loop {
                    interval.tick().await;
                    let following = IS_FOLLOWING.load(Ordering::Relaxed);
                    
                    #[cfg(target_os = "macos")]
                    {
                        use core_graphics::event::CGEvent;
                        use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
                        
                        let mut is_moving = false;
                        let mut facing_right = last_facing_right;

                        if following {
                            if let Ok(source) = CGEventSource::new(CGEventSourceStateID::CombinedSessionState) {
                                if let Ok(event) = CGEvent::new(source) {
                                    let point = event.location();
                                    let target_x = point.x + 20.0;
                                    let target_y = point.y + 20.0;

                                    if current_x == 0.0 && current_y == 0.0 {
                                        current_x = target_x; current_y = target_y;
                                    }
                                    
                                    // Ease-in-out logic with physics
                                    let dx = target_x - current_x;
                                    let dy = target_y - current_y;
                                    
                                    if dx.abs() > 1.0 || dy.abs() > 1.0 {
                                        is_moving = true;
                                        if dx > 0.0 { facing_right = true; } 
                                        else if dx < 0.0 { facing_right = false; }

                                        // Acceleration
                                        vel_x += dx * 0.005;
                                        vel_y += dy * 0.005;
                                    }

                                    // Friction (Damping)
                                    vel_x *= 0.92;
                                    vel_y *= 0.92;

                                    current_x += vel_x;
                                    current_y += vel_y;
                                    
                                    let _ = win.set_position(LogicalPosition::new(current_x, current_y));
                                }
                            }
                        } else {
                            if let Ok(Some(monitor)) = win.current_monitor() {
                                let screen_size = monitor.size().to_logical::<f64>(monitor.scale_factor());
                                let win_size = win.outer_size().unwrap().to_logical::<f64>(monitor.scale_factor());
                                let target_x = screen_size.width - win_size.width - 30.0;
                                let target_y = screen_size.height - win_size.height - 30.0;
                                
                                if current_x == 0.0 && current_y == 0.0 {
                                    current_x = target_x; current_y = target_y;
                                }
                                
                                let dx = target_x - current_x;
                                let dy = target_y - current_y;

                                if dx.abs() > 1.0 || dy.abs() > 1.0 {
                                    is_moving = true;
                                    if dx > 0.0 { facing_right = true; } 
                                    else if dx < 0.0 { facing_right = false; }

                                    vel_x += dx * 0.003;
                                    vel_y += dy * 0.003;
                                }

                                vel_x *= 0.90;
                                vel_y *= 0.90;

                                current_x += vel_x;
                                current_y += vel_y;
                                let _ = win.set_position(LogicalPosition::new(current_x, current_y));
                            }
                        }

                        if is_moving != last_moving_state || facing_right != last_facing_right {
                            #[derive(serde::Serialize, Clone)]
                            struct MovePayload {
                                is_moving: bool,
                                facing_right: bool,
                            }
                            let _ = win.emit("cat-move-state", MovePayload { is_moving, facing_right });
                            last_moving_state = is_moving;
                            last_facing_right = facing_right;
                        }
                    }

                    #[cfg(not(target_os = "macos"))]
                    {
                        if last_moving_state {
                             #[derive(serde::Serialize, Clone)]
                            struct MovePayload {
                                is_moving: bool,
                                facing_right: bool,
                            }
                            let _ = win.emit("cat-move-state", MovePayload { is_moving: false, facing_right: last_facing_right });
                            last_moving_state = false;
                        }
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
