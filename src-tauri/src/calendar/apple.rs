#![cfg(target_os = "macos")]

use crate::calendar::CalendarEvent;
use eventkit::EventsManager;
use chrono::{Local, TimeZone, Datelike};
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};

thread_local! {
    static MANAGER: RefCell<EventsManager> = RefCell::new(EventsManager::new());
}

static HAS_REQUESTED_ACCESS: AtomicBool = AtomicBool::new(false);

pub fn fetch_apple_events() -> Result<Vec<CalendarEvent>, String> {
    MANAGER.with(|manager_cell| {
        let manager = manager_cell.borrow();
        
        // 권한 요청이 한 번도 이루어지지 않았다면 시도
        // (Info.plist가 추가되었으므로 OS가 권한 상태를 기억하게 됩니다)
        if !HAS_REQUESTED_ACCESS.load(Ordering::Relaxed) {
            println!("Requesting Calendar Access for the first time...");
            if let Err(e) = manager.request_access() {
                return Err(format!("Calendar Access Denied: {:?}", e));
            }
            HAS_REQUESTED_ACCESS.store(true, Ordering::Relaxed);
        }
        
        let now = Local::now();
        let search_start = now; 
        let search_end = Local.with_ymd_and_hms(now.year(), now.month(), now.day(), 23, 59, 59).unwrap();
        
        let wake_up_buffer = chrono::Duration::minutes(15);
        
        match manager.fetch_events(search_start, search_end, None) {
            Ok(events) => {
                let active_events: Vec<_> = events.into_iter()
                    .filter(|e| {
                        e.start_date <= (now + wake_up_buffer)
                    })
                    .collect();

                let calendar_events = active_events.into_iter().map(|e| CalendarEvent {
                    title: e.title,
                    start_time: e.start_date.to_rfc3339(),
                    source: "apple".to_string(),
                }).collect();
                Ok(calendar_events)
            },
            Err(e) => Err(format!("Failed to fetch events: {:?}", e))
        }
    })
}
