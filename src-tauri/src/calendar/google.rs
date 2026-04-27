use crate::calendar::CalendarEvent;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use once_cell::sync::Lazy;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct GoogleToken {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
}

static ACCESS_TOKEN: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

pub async fn google_login(app_handle: tauri::AppHandle) -> Result<String, String> {
    println!("Google Login Initiated...");

    let client_id = std::env::var("GOOGLE_CLIENT_ID").map_err(|_| "GOOGLE_CLIENT_ID not set in environment".to_string())?;
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").map_err(|_| "GOOGLE_CLIENT_SECRET not set in environment".to_string())?;
    
    // 1. OAuth 리스너 시작
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(1);

    let port = tauri_plugin_oauth::start(move |url| {
        println!("OAuth Code Received in Listener");
        if let Ok(parsed_url) = url::Url::parse(&url) {
            if let Some(code) = parsed_url.query_pairs().find(|(key, _)| key == "code").map(|(_, val)| val.into_owned()) {
                let _ = tx.blocking_send(code);
            }
        }
    }).map_err(|e| {
        let err_msg = format!("Failed to start OAuth listener: {}", e);
        println!("{}", err_msg);
        err_msg
    })?;

    // 2. 인증 URL 생성
    let redirect_uri = format!("http://localhost:{}", port);
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={}&redirect_uri={}&scope=https://www.googleapis.com/auth/calendar.readonly&access_type=offline&prompt=consent",
        client_id, redirect_uri
    );
    
    println!("Opening Auth URL: {}", auth_url);

    // 3. 브라우저 열기 (타우리 플러그인 사용)
    app_handle.opener().open_url(&auth_url, None::<String>).map_err(|e| {
        let err_msg = format!("Failed to open browser: {}", e);
        println!("{}", err_msg);
        err_msg
    })?;

    // 4. 인증 코드 대기 및 토큰 교환
    if let Some(code) = rx.recv().await {
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
            let token_text = resp.text().await.map_err(|e| format!("Failed to get token text: {}", e))?;
            println!("Token Response Received");
            let token: GoogleToken = serde_json::from_str(&token_text).map_err(|e| {
                println!("JSON Parse Error: {}. Response was: {}", e, token_text);
                format!("Failed to parse token: {}", e)
            })?;
            
            let mut stored_token = ACCESS_TOKEN.lock().unwrap();
            *stored_token = Some(token.access_token.clone());
            println!("Login Successful! Token stored.");
            return Ok("Logged in successfully!".to_string());
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            println!("Token Exchange Failed. Status: {}, Body: {}", status, body);
            return Err(format!("Token exchange failed: {} - {}", status, body));
        }
    }

    println!("No code received from listener");
    Err("Login failed or cancelled".to_string())
}

#[tauri::command]
pub fn google_logout() -> Result<(), String> {
    let mut token = ACCESS_TOKEN.lock().unwrap();
    *token = None;
    Ok(())
}

#[tauri::command]
pub fn is_google_logged_in() -> bool {
    ACCESS_TOKEN.lock().unwrap().is_some()
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
        println!("Fetched {} events from Google Calendar", items.len());
        for item in items {
            let title = item["summary"].as_str().unwrap_or("No Title").to_string();
            let start_time = item["start"]["dateTime"].as_str()
                .or(item["start"]["date"].as_str())
                .unwrap_or("")
                .to_string();

            println!(" - Event: {}, Start: {}", title, start_time);

            events.push(CalendarEvent {
                title,
                start_time,
                source: "google".to_string(),
            });
        }
    }
    return Ok(events);
} else {
    println!("Failed to fetch events. Status: {}", resp.status());
}

    }

    Ok(vec![])
}
