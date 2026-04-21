use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CalendarEvent {
    pub title: String,
    pub start_time: String,
    pub source: String, // "google", "outlook", "apple"
}

pub mod google;
pub mod outlook;

#[cfg(target_os = "macos")]
pub mod apple;
