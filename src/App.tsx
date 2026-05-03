import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition } from "@tauri-apps/api/dpi";
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
  
  const manualWaitEventIdRef = useRef<string | null>(null);
  const bubbleIntervalRef = useRef<any>(null);

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
      const events = allEvents.filter(e => !e.title.includes("생일") && !e.title.toLowerCase().includes("birthday"));
      const now = new Date().getTime();
      let targetEvent: CalendarEvent | null = null;

      for (const event of events) {
        const startTime = new Date(event.start_time).getTime();
        const diffMins = (startTime - now) / 60000;
        
        // 정확히 10분 이내 (0 ~ 10분) 일 때만 깨어남
        // 시작 시간이 지나면 (diffMins <= 0) 즉시 취침
        if (diffMins > 0 && diffMins <= 10) {
          targetEvent = event; 
          break; 
        }
      }
      
      const eventId = targetEvent ? `${targetEvent.title}-${targetEvent.start_time}` : null;
      if (!eventId) manualWaitEventIdRef.current = null;
      const isWaiting = eventId !== null && manualWaitEventIdRef.current === eventId;

      await invoke("sync_state", { eventId: isWaiting ? null : eventId });

      if (targetEvent && !isWaiting) {
        const isNewEvent = !hasEvents || nextEvent?.title !== targetEvent.title;
        setNextEvent(targetEvent);
        setHasEvents(true);
        if (isNewEvent) triggerBubble(targetEvent);
      } else {
        setHasEvents(false);
        if (!isWaiting) setNextEvent(null);
      }
    } catch (err) { console.error(err); }
  };

  const triggerBubble = (event: CalendarEvent) => {
    if (manualWaitEventIdRef.current) return;
    const startTime = new Date(event.start_time);
    const diffMins = Math.max(0, Math.floor((startTime.getTime() - new Date().getTime()) / 60000));
    setNyangMessage(`${event.title} 시작까지 ${diffMins}분 남았다냥!`);
    setShowNyangBubble(true);
    setTimeout(() => setShowNyangBubble(false), 7000);
  };
const handleManualWait = async () => {
  if (nextEvent) {
    const eventId = `${nextEvent.title}-${nextEvent.start_time}`;
    manualWaitEventIdRef.current = eventId;
    await invoke("mark_manual_sleep");
  }

  const btnWin = getCurrentWebviewWindow() as any;
  const pos = await btnWin.outerPosition();
  // @ts-ignore
  const monitor = await btnWin.currentMonitor();
  if (monitor) {
    const f = monitor.scaleFactor;
    const x = (pos.x / f);
    const y = (pos.y / f);
    const wins = await getAllWebviewWindows();
    const mainWin = wins.find(w => w.label === "main") as any;
    if (mainWin) {
      await mainWin.setPosition(new LogicalPosition(x, y));
    }
  }

  setHasEvents(false);
  setShowNyangBubble(false);
  await btnWin.hide(); // 모든 처리가 끝난 후 마지막에 숨김
};


  useEffect(() => {
    checkEvents();
    const interval = setInterval(checkEvents, 5000);
    return () => clearInterval(interval);
  }, [nextEvent?.title, hasEvents]);

  useEffect(() => {
    if (hasEvents && nextEvent) {
      bubbleIntervalRef.current = setInterval(() => { triggerBubble(nextEvent); }, 20000);
    } else {
      if (bubbleIntervalRef.current) clearInterval(bubbleIntervalRef.current);
      setShowNyangBubble(false);
    }
    return () => { if (bubbleIntervalRef.current) clearInterval(bubbleIntervalRef.current); };
  }, [hasEvents, nextEvent?.title]);

  useEffect(() => {
    if (hasEvents) setShowCalendar(false);
  }, [hasEvents]);

  if (windowLabel === "main") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-transparent overflow-hidden select-none relative">
        <div className="relative flex flex-col items-center">
          {/* 말풍선 */}
          {hasEvents && (
            <div className="absolute bottom-[100%] mb-2 pointer-events-none">
              <SpeechBubble message={nyangMessage} isVisible={showNyangBubble} />
            </div>
          )}
          
          {/* 고양이 */}
          <Cat 
            onCatClick={() => { if (!hasEvents) setShowCalendar(!showCalendar); }} 
            isSleeping={!hasEvents} 
            isMoving={isActuallyMoving}
            facingRight={facingRight}
          />

          {/* 위젯 */}
          {showCalendar && (
            <div className="absolute top-full mt-[-10px] z-[9999] pointer-events-auto">
              <CalendarWidget isVisible={showCalendar} onClose={() => setShowCalendar(false)} />
            </div>
          )}
          
          {/* 기다리기 버튼 중복 노출 제거함 (sleep-button 창에서만 렌더링) */}
        </div>
      </div>
    );
  }

  if (windowLabel === "sleep-button") {
    return (
      <div className="w-full h-full flex items-center justify-center bg-transparent overflow-hidden">
        <button 
          onClick={handleManualWait} 
          style={{ 
            background: 'transparent', 
            backgroundColor: 'transparent',
            border: 'none', 
            padding: 0, 
            outline: 'none', 
            boxShadow: 'none',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none'
          }}
          className="active:opacity-70"
        >
          <img 
            src="/wait_2.png?v=1" 
            alt="기다리기" 
            className="w-12 h-auto block" 
            style={{ 
              imageRendering: 'pixelated',
              backgroundColor: 'transparent',
              pointerEvents: 'none'
            }} 
          />
        </button>
      </div>
    );
  }
  return null;
}
export default App;
