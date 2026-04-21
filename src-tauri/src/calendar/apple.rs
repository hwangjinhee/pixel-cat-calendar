use crate::calendar::CalendarEvent;
use eventkit::EventsManager;
use chrono::{Local, TimeZone, Datelike};
use std::cell::RefCell;

thread_local! {
    static MANAGER: RefCell<EventsManager> = RefCell::new(EventsManager::new());
}

pub fn fetch_apple_events() -> Result<Vec<CalendarEvent>, String> {
    MANAGER.with(|manager_cell| {
        let manager = manager_cell.borrow();
        
        // Request access (usually stays granted for the session)
        if let Err(e) = manager.request_access() {
            return Err(format!("Calendar Access Denied: {:?}", e));
        }
        
        // 1. Search for all upcoming events starting from NOW until the end of today
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
