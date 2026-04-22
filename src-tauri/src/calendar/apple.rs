#![cfg(target_os = "macos")]

use crate::calendar::CalendarEvent;
use eventkit::EventsManager;
use chrono::{Local, TimeZone, Datelike};
use std::cell::RefCell;
use std::sync::atomic::{AtomicU8, Ordering};

thread_local! {
    static MANAGER: RefCell<EventsManager> = RefCell::new(EventsManager::new());
}

// 0: 미요청, 1: 요청 중, 2: 요청 완료(결과 무관)
static ACCESS_STATE: AtomicU8 = AtomicU8::new(0);

pub fn fetch_apple_events() -> Result<Vec<CalendarEvent>, String> {
    MANAGER.with(|manager_cell| {
        let manager = manager_cell.borrow();
        
        let current_state = ACCESS_STATE.load(Ordering::Relaxed);

        if current_state == 0 {
            // 처음 한 번만 권한 요청 시도
            ACCESS_STATE.store(1, Ordering::Relaxed);
            println!("Requesting Calendar Access for the first time...");
            
            // 이 함수는 사용자 응답 전까지 블로킹될 수 있으므로 주의
            let _ = manager.request_access(); 
            
            ACCESS_STATE.store(2, Ordering::Relaxed);
        } else if current_state == 1 {
            // 이미 요청 중인 경우 조용히 빈 결과 반환
            return Ok(vec![]);
        }
        
        // 권한이 실제로 있는 경우에만 이벤트 가져오기 시도
        // (권한이 없으면 fetch_events에서 에러가 나며 catch 문으로 넘어가게 됨)
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
            Err(_) => {
                // 권한이 없거나 에러가 나면 조용히 빈 결과 반환
                Ok(vec![])
            }
        }
    })
}
