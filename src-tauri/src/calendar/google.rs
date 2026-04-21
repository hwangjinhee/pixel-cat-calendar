use crate::calendar::CalendarEvent;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use once_cell::sync::Lazy;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct GoogleToken {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
}

static ACCESS_TOKEN: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

pub async fn login(_app_handle: tauri::AppHandle) -> Result<String, String> {
    let client_id = std::env::var("GOOGLE_CLIENT_ID").map_err(|_| "GOOGLE_CLIENT_ID not found in .env")?;
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").map_err(|_| "GOOGLE_CLIENT_SECRET not found in .env")?;

    // Create a channel to receive the code
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(1);

    // Start the local server
    let port = tauri_plugin_oauth::start(move |url| {
        // Parse the code from the URL
        if let Ok(parsed_url) = url::Url::parse(&url) {
            if let Some(code) = parsed_url.query_pairs().find(|(key, _)| key == "code").map(|(_, val)| val.into_owned()) {
                let _ = tx.blocking_send(code);
            }
        }
    }).map_err(|e| format!("Failed to start OAuth listener: {}", e))?;

    let redirect_uri = format!("http://localhost:{}", port);
    
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={}&redirect_uri={}&scope=https://www.googleapis.com/auth/calendar.readonly&access_type=offline&prompt=consent",
        client_id, redirect_uri
    );

    // Open browser for login
    let _ = webbrowser::open(&auth_url);

    // Wait for the code from the channel
    if let Some(code) = rx.recv().await {
        // Exchange code for token
        let client = reqwest::Client::new();
        let resp = client.post("https://oauth2.googleapis.com/token")
            .form(&[
                ("code", code.as_str()),
                ("client_id", client_id.as_str()),
                ("client_secret", client_secret.as_str()),
                ("redirect_uri", redirect_uri.as_str()),
                ("grant_type", "authorization_code"),
            ])
            .send()
            .await
            .map_err(|e| format!("Token request failed: {}", e))?;

        if resp.status().is_success() {
            let token: GoogleToken = resp.json().await.map_err(|e| format!("Failed to parse token: {}", e))?;
            let mut stored_token = ACCESS_TOKEN.lock().unwrap();
            *stored_token = Some(token.access_token.clone());
            return Ok("Logged in successfully!".to_string());
        } else {
            return Err(format!("Token exchange failed: {}", resp.status()));
        }
    }

    Err("OAuth timed out or failed".to_string())
}

pub async fn fetch_google_events() -> Result<Vec<CalendarEvent>, String> {
    let token = {
        let stored = ACCESS_TOKEN.lock().unwrap();
        stored.clone()
    };

    if let Some(access_token) = token {
        let client = reqwest::Client::new();
        let now = chrono::Utc::now().to_rfc3339();
        
        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin={}&maxResults=10&singleEvents=true&orderBy=startTime",
            urlencoding::encode(&now)
        );

        let resp = client.get(&url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if resp.status().is_success() {
            let data: serde_json::Value = resp.json().await.map_err(|e| format!("JSON parse failed: {}", e))?;
            let mut events = Vec::new();

            if let Some(items) = data["items"].as_array() {
                for item in items {
                    let title = item["summary"].as_str().unwrap_or("No Title").to_string();
                    let start_time = item["start"]["dateTime"].as_str()
                        .or(item["start"]["date"].as_str())
                        .unwrap_or("")
                        .to_string();

                    events.push(CalendarEvent {
                        title,
                        start_time,
                        source: "google".to_string(),
                    });
                }
            }
            return Ok(events);
        } else if resp.status() == 401 {
            return Err("Unauthorized: Please login to Google".to_string());
        }
    }

    Ok(vec![])
}
