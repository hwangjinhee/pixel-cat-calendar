#![cfg(target_os = "macos")]

use crate::calendar::CalendarEvent;
use eventkit_rs::{EventsManager, AuthorizationStatus};
use chrono::{Local, TimeZone, Datelike};
use std::cell::RefCell;
use std::sync::atomic::{AtomicU8, Ordering};

thread_local! {
    static MANAGER: RefCell<EventsManager> = RefCell::new(EventsManager::new());
}

// 0: 미요청, 1: 요청 중, 2: 요청 완료
static ACCESS_STATE: AtomicU8 = AtomicU8::new(0);

pub fn fetch_apple_events() -> Result<Vec<CalendarEvent>, String> {
    MANAGER.with(|manager_cell| {
        let manager = manager_cell.borrow();

        // 현재 권한 상태 확인
        let auth_status = EventsManager::authorization_status();

        // 1. 이미 거부되었거나 제한된 경우 -> 조용히 빈 결과 반환 (알럿 안 띄움)
        if matches!(auth_status, AuthorizationStatus::Denied | AuthorizationStatus::Restricted) {
            return Ok(vec![]);
        }

        let current_state = ACCESS_STATE.load(Ordering::Relaxed);

        // 2. 아직 권한이 결정되지 않은 경우(NotDetermined) -> 딱 한 번만 요청
        if current_state == 0 && matches!(auth_status, AuthorizationStatus::NotDetermined) {
            ACCESS_STATE.store(1, Ordering::Relaxed);
            println!("Requesting Calendar Access for the first time...");
            
            // request_access는 내부적으로 TCC 알럿을 띄웁니다.
            let success = manager.request_access().unwrap_or(false); 
            ACCESS_STATE.store(2, Ordering::Relaxed);
            
            if !success {
                return Ok(vec![]);
            }
        } else if matches!(auth_status, AuthorizationStatus::NotDetermined) && (current_state == 1 || current_state == 2) {
            // 이미 요청 중이거나 한 번 시도했다면 더 이상 아무것도 안 함
            return Ok(vec![]);
        }

        // 3. 권한이 있는 경우에만 데이터 가져오기 (FullAccess 또는 WriteOnly 등)
        let is_authorized = !matches!(auth_status, AuthorizationStatus::NotDetermined | AuthorizationStatus::Denied | AuthorizationStatus::Restricted);

        if !is_authorized {
            return Ok(vec![]);
        }
        
        let now = Local::now();
        let search_start = now; 
        let search_end = Local.with_ymd_and_hms(now.year(), now.month(), now.day(), 23, 59, 59).unwrap();
        
        let wake_up_buffer = chrono::Duration::minutes(15);
        
        match manager.fetch_events(search_start, search_end, None) {
            Ok(events) => {
                let active_events = events.into_iter()
                    .filter(|e| {
                        e.start_date <= (now + wake_up_buffer)
                    })
                    .collect::<Vec<_>>();

                let calendar_events = active_events.into_iter().map(|e| CalendarEvent {
                    title: e.title,
                    start_time: e.start_date.to_rfc3339(),
                    source: "apple".to_string(),
                }).collect();
                Ok(calendar_events)
            },
            Err(_) => Ok(vec![])
        }
    })
}
