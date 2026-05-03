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
  const [debugLog, setDebugLog] = useState<string[]>([]);
  
  const manualWaitEventIdRef = useRef<string | null>(null);
  const bubbleIntervalRef = useRef<any>(null);

  const addLog = (msg: string) => {
    setDebugLog(prev => [msg, ...prev].slice(0, 5));
    console.log(msg);
  };

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
    } catch (err) { addLog(`Error: ${err}`); }
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
    addLog("Wait button clicked");
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

  // 마우스 이벤트 투과 로직 (디버깅 포함)
  useEffect(() => {
    if (windowLabel !== "main") return;
    const mainWin = getCurrentWebviewWindow();
    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // .pointer-events-auto 속성을 가진 요소 위에 있을 때만 마우스 이벤트를 활성화
      const isInteractive = target.closest('.pointer-events-auto');
      mainWin.setIgnoreCursorEvents(!isInteractive);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [windowLabel]);

  if (windowLabel === "main") {
    return (
      <div 
        className="w-full h-full flex flex-col items-center justify-start bg-transparent overflow-hidden select-none relative pt-4"
      >
        {/* 디버그 로그 패널 (윈도우 테스트용, 작게 노출) */}
        <div className="absolute top-0 right-0 p-1 text-[8px] text-red-500 bg-white/20 pointer-events-none z-[10000]">
          {debugLog.map((log, i) => <div key={i}>{log}</div>)}
        </div>

        <div className="relative flex flex-col items-center pointer-events-none">
          <div className="pointer-events-auto">
            <Cat 
              onCatClick={() => { 
                addLog("Cat clicked");
                if (!hasEvents) setShowCalendar(!showCalendar); 
              }} 
              isSleeping={!hasEvents} 
              isMoving={isActuallyMoving}
              facingRight={facingRight}
            />      
          </div>
          <div className="w-full flex flex-col items-center gap-2 mt-2">
            {hasEvents && (
              <div className="pointer-events-none z-50">
                <SpeechBubble message={nyangMessage} isVisible={showNyangBubble} />
              </div>
            )}
            {showCalendar && (
              <div className="z-[9999] pointer-events-auto">
                <CalendarWidget isVisible={showCalendar} onClose={() => setShowCalendar(false)} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (windowLabel === "sleep-button") {
    return (
      <div className="w-full h-full flex items-center justify-center bg-transparent overflow-hidden">
        <button 
          onClick={handleManualWait} 
          style={{ background: 'transparent', border: 'none', padding: 0, outline: 'none', cursor: 'pointer' }}
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
