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
      const events = await invoke<CalendarEvent[]>("get_all_events");
      const now = new Date().getTime();
      let targetEvent: CalendarEvent | null = null;

      for (const event of events) {
        const startTime = new Date(event.start_time).getTime();
        const diffMins = (startTime - now) / 60000;
        if (diffMins > 0 && diffMins <= 10) {
          targetEvent = event; break; 
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

  if (windowLabel === "main") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-transparent overflow-hidden">
        {/* 고양이 컴포넌트 (isSleeping이 true일 때 눕기 이미지) */}
        <Cat 
          onCatClick={() => setShowCalendar(!showCalendar)} 
          isSleeping={!hasEvents} 
          isMoving={isActuallyMoving}
          facingRight={facingRight}
        />      
        {/* 말풍선은 hasEvents가 true일 때만 렌더링되도록 함 */}
        {hasEvents && (
          <div className="absolute bottom-full mb-2">
            <SpeechBubble message={nyangMessage} isVisible={showNyangBubble} />
          </div>
        )}
        <div className="fixed top-1/2 left-1/2 -translate-y-1/2 ml-16">
          <CalendarWidget isVisible={showCalendar} onClose={() => setShowCalendar(false)} />
        </div>
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
