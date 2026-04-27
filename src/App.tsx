import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Cat } from "./components/Cat";
import { CalendarWidget } from "./components/CalendarWidget";
import { SpeechBubble } from "./components/SpeechBubble";

interface CalendarEvent {
  title: string;
  start_time: string;
  source: string;
}

function App() {
  const [windowLabel, setWindowLabel] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [hasEvents, setHasEvents] = useState(false);
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
  const [showNyangBubble, setShowNyangBubble] = useState(false);
  const [nyangMessage, setNyangMessage] = useState("");
  const [isActuallyMoving, setIsActuallyMoving] = useState(false);
  const [facingRight, setFacingRight] = useState(false);
  
  // 수동 대기(기다리기) 상태 기록
  const manualWaitEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    setWindowLabel(getCurrentWebviewWindow().label);
  }, []);

  useEffect(() => {
    let unlisten: any;
    const setupListen = async () => {
      unlisten = await listen<{is_moving: boolean, facing_right: boolean}>("cat-move-state", (event) => {
        setIsActuallyMoving(event.payload.is_moving);
        setFacingRight(event.payload.facing_right);
      });
    };
    setupListen();
    return () => { if (unlisten) unlisten(); };
  }, []);

  const checkEvents = async () => {
    try {
      const allEvents = await invoke<CalendarEvent[]>("get_all_events");
      // 생일 일정 필터링
      const events = allEvents.filter(e => !e.title.includes("생일") && !e.title.toLowerCase().includes("birthday"));
      
      const now = new Date().getTime();
      let targetEvent: CalendarEvent | null = null;

      for (const event of events) {
        const startTime = new Date(event.start_time).getTime();
        const diffMins = (startTime - now) / 60000;
        
        // 시작 시간이 0분~60분 사이인 '미래'의 일정일 때만 고양이가 일어남
        if (diffMins > 0 && diffMins <= 60) {
          targetEvent = event; 
          break; 
        }
      }
      
      const eventId = targetEvent ? `${targetEvent.title}-${targetEvent.start_time}` : null;
      
      // 1. 수동 대기 중인지 확인 (eventId가 없으면 초기화)
      if (!eventId) {
        manualWaitEventIdRef.current = null;
      }
      const isWaiting = eventId !== null && manualWaitEventIdRef.current === eventId;

      // 2. 백엔드 상태 동기화 (기다리기 중이면 팔로잉 무조건 차단)
      await invoke("sync_state", { eventId: isWaiting ? null : eventId });

      // 3. 프론트엔드 UI 상태 결정
      if (targetEvent && !isWaiting) {
        setNextEvent(targetEvent);
        setHasEvents(true);
      } else {
        setHasEvents(false);
        if (!isWaiting) setNextEvent(null);
      }
    } catch (err) { console.error(err); }
  };

  const handleManualWait = async () => {
    if (nextEvent) {
      const eventId = `${nextEvent.title}-${nextEvent.start_time}`;
      manualWaitEventIdRef.current = eventId;
      // 백엔드에 직접 대기 상태 각인
      await invoke("mark_manual_sleep");
    }
    // 즉시 모든 알람 요소 차단
    setHasEvents(false);
    setShowNyangBubble(false);
  };

  useEffect(() => {
    checkEvents();
    const interval = setInterval(checkEvents, 5000);
    return () => clearInterval(interval);
  }, [nextEvent?.title, hasEvents]);

  // 말풍선 타이머 (더 엄격하게 제어)
  useEffect(() => {
    if (!hasEvents || !nextEvent) {
      setShowNyangBubble(false);
      return;
    }

    const triggerBubble = () => {
      if (!hasEvents || manualWaitEventIdRef.current) return;

      const startTime = new Date(nextEvent.start_time);
      const diffMins = Math.max(0, Math.floor((startTime.getTime() - new Date().getTime()) / 60000));
      setNyangMessage(`${nextEvent.title} 시작까지 ${diffMins}분 남았다냥!`);
      setShowNyangBubble(true);
      setTimeout(() => setShowNyangBubble(false), 8000);
    };

    const interval = setInterval(triggerBubble, 15000);
    return () => clearInterval(interval);
  }, [hasEvents, nextEvent?.title]);

  useEffect(() => {
    if (hasEvents) {
      setShowCalendar(false);
    }
  }, [hasEvents]);

  if (windowLabel === "main") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-transparent overflow-hidden">
        {/* 고양이 컴포넌트 */}
        <Cat 
          onCatClick={() => {
            // 일정이 없을 때(잠잘 때)만 캘린더를 열 수 있음
            if (!hasEvents) {
              setShowCalendar(!showCalendar);
            }
          }} 
          isSleeping={!hasEvents} 
          isMoving={isActuallyMoving}
          facingRight={facingRight}
        />      
        {/* 말풍선은 hasEvents가 true일 때만 렌더링 */}
        {hasEvents && (
          <div className="absolute bottom-full mb-2 pointer-events-none">
            <SpeechBubble message={nyangMessage} isVisible={showNyangBubble} />
          </div>
        )}
        {/* 위젯은 showCalendar가 true일 때만 명시적으로 렌더링 */}
        {showCalendar && (
          <div 
            className="absolute z-[100] mb-32 ml-32 pointer-events-auto"
            style={{ transform: 'translate(0, 10px)', width: 'max-content' }}
          >
            <CalendarWidget isVisible={showCalendar} onClose={() => setShowCalendar(false)} />
          </div>
        )}
      </div>
    );
  }

  if (windowLabel === "sleep-button") {
    return (
      <div className="w-full h-full flex items-center justify-center bg-transparent">
        <button 
          onClick={handleManualWait}
          style={{ 
            cursor: 'pointer',
            background: 'none',
            backgroundColor: 'transparent',
            border: 'none',
            padding: 0,
            outline: 'none',
            boxShadow: 'none'
          }}
          className="active:opacity-70"
        >
          <img 
            src="/wait_2.png?v=1" 
            alt="기다리기" 
            className="w-12 h-auto"
            style={{ 
              imageRendering: 'pixelated',
              display: 'block' 
            }}
          />
        </button>
      </div>
    );
  }

  return null;
}

export default App;
