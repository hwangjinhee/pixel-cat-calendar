use crate::calendar::CalendarEvent;

pub async fn fetch_outlook_events() -> Result<Vec<CalendarEvent>, String> {
    // Outlook API 연동 전까지는 빈 배열을 반환하여 고양이가 잠들 수 있게 합니다.
    Ok(vec![])
}
