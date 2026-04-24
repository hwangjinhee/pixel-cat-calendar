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

// 구글 앱의 '공용 열쇠' (Client ID)
// 이 값은 외부에 공개되어도 안전한 값입니다.
const GOOGLE_CLIENT_ID: &str = "595602940240-bgnm421bm7mn2v0sm4cph8a8e2ashpat.apps.googleusercontent.com";

pub async fn login(_app_handle: tauri::AppHandle) -> Result<String, String> {
    // 1. OAuth 리스너 시작
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(1);

    let port = tauri_plugin_oauth::start(move |url| {
        if let Ok(parsed_url) = url::Url::parse(&url) {
            if let Some(code) = parsed_url.query_pairs().find(|(key, _)| key == "code").map(|(_, val)| val.into_owned()) {
                let _ = tx.blocking_send(code);
            }
        }
    }).map_err(|e| format!("Failed to start OAuth listener: {}", e))?;

    // 2. 인증 URL 생성
    let redirect_uri = format!("http://localhost:{}", port);
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={}&redirect_uri={}&scope=https://www.googleapis.com/auth/calendar.readonly&access_type=offline&prompt=consent",
        GOOGLE_CLIENT_ID, redirect_uri
    );

    // 3. 브라우저 열기
    if let Err(e) = webbrowser::open(&auth_url) {
        return Err(format!("Failed to open browser: {}", e));
    }

    // 4. 인증 코드 대기 및 토큰 교환
    if let Some(code) = rx.recv().await {
        let client = reqwest::Client::new();
        let resp = client.post("https://oauth2.googleapis.com/token")
            .form(&[
                ("code", code.as_str()),
                ("client_id", GOOGLE_CLIENT_ID),
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
        }
    }

    Err("Login failed or cancelled".to_string())
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
        }
    }

    Ok(vec![])
}
