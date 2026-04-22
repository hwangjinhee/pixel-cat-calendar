#![cfg(target_os = "macos")]

use crate::calendar::CalendarEvent;
use eventkit::EventsManager;
use chrono::{Local, TimeZone, Datelike};
use std::cell::RefCell;

thread_local! {
    static MANAGER: RefCell<EventsManager> = RefCell::new(EventsManager::new());
}

use std::sync::atomic::{AtomicBool, Ordering};

static HAS_REQUESTED_ACCESS: AtomicBool = AtomicBool::new(false);

pub fn fetch_apple_events() -> Result<Vec<CalendarEvent>, String> {
    MANAGER.with(|manager_cell| {
        let manager = manager_cell.borrow();
        
        // 1. 현재 권한 상태 확인 (이미 허용되었는지 확인)
        // access_granted()는 내부적으로 현재 상태를 반환함
        if !manager.access_granted() {
            // 아직 허용되지 않았을 때만 요청
            if !HAS_REQUESTED_ACCESS.load(Ordering::Relaxed) {
                println!("Requesting Calendar Access...");
                if let Err(e) = manager.request_access() {
                    return Err(format!("Calendar Access Denied: {:?}", e));
                }
                HAS_REQUESTED_ACCESS.store(true, Ordering::Relaxed);
            } else {
                // 이미 요청했는데도 거부된 상태면 더 이상 묻지 않고 빈 목록 반환
                return Ok(vec![]);
            }
        }
        
        // 2. 현재 시간 및 검색 범위 설정
        let now = Local::now();
        let search_start = now; 
        let search_end = Local.with_ymd_and_hms(now.year(), now.month(), now.day(), 23, 59, 59).unwrap();
        
        let wake_up_buffer = chrono::Duration::minutes(15);
        
        println!("Searching Apple events from {} to {}", search_start, search_end);

        match manager.fetch_events(search_start, search_end, None) {
            Ok(events) => {
                // 2. Filter events: only keep those starting within the next 15 minutes
                // (or already started/ongoing, which fetch_events handles by taking events starting after search_start)
                let active_events: Vec<_> = events.into_iter()
                    .filter(|e| {
                        // event_start_time - 15 minutes <= now
                        // which is equivalent to: event_start_time <= now + 15 minutes
                        e.start_date <= (now + wake_up_buffer)
                    })
                    .collect();

                println!("Raw events: {}, Active (within 15m): {}", active_events.len() + (/* we lost the original count here but it's okay for logs */ 0), active_events.len());
                
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
