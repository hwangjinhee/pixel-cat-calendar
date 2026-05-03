import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
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

  // 창 크기 동적 조절 (말풍선/위젯 여부에 따라)
  useEffect(() => {
    if (windowLabel !== "main") return;
    const updateWindowSize = async () => {
      try {
        const mainWin = getCurrentWebviewWindow();
        const currentSize = await mainWin.innerSize();
        
        let targetWidth = 130;
        let targetHeight = 130;

        if (showNyangBubble || showCalendar || hasEvents) {
          targetWidth = 150;
          targetHeight = 350;
        }

        // 현재 크기와 다를 때만 업데이트하여 무한 루프나 부하 방지
        if (currentSize.width !== targetWidth || currentSize.height !== targetHeight) {
          await mainWin.setSize(new LogicalSize(targetWidth, targetHeight));
        }
      } catch (e) {
        console.error("Window resize failed:", e);
      }
    };
    updateWindowSize();
  }, [showNyangBubble, showCalendar, hasEvents, windowLabel]);

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
        if (diffMins > 0 && diffMins <= 10) {
          targetEvent = event; break; 
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
    setHasEvents(false);
    setShowNyangBubble(false);
    if (nextEvent) {
      const eventId = `${nextEvent.title}-${nextEvent.start_time}`;
      manualWaitEventIdRef.current = eventId;
      await invoke("mark_manual_sleep");
    }
    const btnWin = getCurrentWebviewWindow() as any;
    btnWin.hide();
    const pos = await btnWin.outerPosition();
    const monitor = await btnWin.currentMonitor();
    if (monitor) {
      const f = monitor.scaleFactor;
      const x = (pos.x / f);
      const y = (pos.y / f);
      const wins = await getAllWebviewWindows();
      const mainWin = wins.find(w => w.label === "main") as any;
      if (mainWin) {
        await mainWin.setPosition(new LogicalPosition(x, y));
        await mainWin.setFocus(); 
      }
    }
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
      <div className="w-full h-full flex flex-col items-center justify-start bg-transparent overflow-hidden select-none relative pt-2">
        {/* 고양이 영역 */}
        <Cat 
          onCatClick={() => { if (!hasEvents) setShowCalendar(!showCalendar); }} 
          isSleeping={!hasEvents} 
          isMoving={isActuallyMoving}
          facingRight={facingRight}
        />      
        {/* 말풍선 & 위젯 - 창 아래로 자연스럽게 배치 */}
        <div className="relative w-full flex flex-col items-center gap-2">
          {hasEvents && (
            <div className="mt-2 pointer-events-none z-50">
              <SpeechBubble message={nyangMessage} isVisible={showNyangBubble} />
            </div>
          )}
          {showCalendar && (
            <div className="mt-[-10px] z-[9999] pointer-events-auto">
              <CalendarWidget isVisible={showCalendar} onClose={() => setShowCalendar(false)} />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (windowLabel === "sleep-button") {
    return (
      <div className="w-full h-full flex items-center justify-center bg-transparent overflow-hidden">
        <button 
          onClick={handleManualWait} 
          style={{ background: 'transparent', backgroundColor: 'transparent', border: 'none', padding: 0, outline: 'none', cursor: 'pointer', appearance: 'none' }}
          className="active:opacity-70 pointer-events-auto"
        >
          <img src="/wait_2.png?v=1" alt="기다리기" className="w-12 h-auto block" style={{ imageRendering: 'pixelated' }} />
        </button>
      </div>
    );
  }
  return null;
}
export default App;
