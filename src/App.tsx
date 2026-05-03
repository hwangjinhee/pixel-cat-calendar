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
  const [followingEvent, setFollowingEvent] = useState<CalendarEvent | null>(null);
  const [showNyangBubble, setShowNyangBubble] = useState(false);
  const [nyangMessage, setNyangMessage] = useState("");
  const [followingMessage, setFollowingMessage] = useState("");
  const [isActuallyMoving, setIsActuallyMoving] = useState(false);
  const [facingRight, setFacingRight] = useState(false);
  
  const manualWaitEventIdRef = useRef<string | null>(null);
  const bubbleIntervalRef = useRef<any>(null);

  useEffect(() => {
    setWindowLabel(getCurrentWebviewWindow().label);
  }, []);

  useEffect(() => {
    if (windowLabel !== "main") return;
    const updateWindowSize = async () => {
      try {
        const mainWin = getCurrentWebviewWindow();
        const currentSize = await mainWin.innerSize();
        let targetWidth = 130;
        let targetHeight = 130;
        if (showNyangBubble || showCalendar || hasEvents) {
          targetWidth = 200;
          targetHeight = 450; // 이중 말풍선을 위해 높이 상향
        }
        if (currentSize.width !== targetWidth || currentSize.height !== targetHeight) {
          await mainWin.setSize(new LogicalSize(targetWidth, targetHeight));
        }
      } catch (e) { console.error(e); }
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
      let secondEvent: CalendarEvent | null = null;

      for (const event of events) {
        const startTime = new Date(event.start_time).getTime();
        const diffMins = (startTime - now) / 60000;
        if (diffMins > 0 && diffMins <= 10) {
          if (!targetEvent) targetEvent = event;
          else { secondEvent = event; break; } // 겹치는 두 번째 일정
        }
      }
      
      const eventId = targetEvent ? `${targetEvent.title}-${targetEvent.start_time}` : null;
      if (!eventId) manualWaitEventIdRef.current = null;
      const isWaiting = eventId !== null && manualWaitEventIdRef.current === eventId;

      await invoke("sync_state", { eventId: isWaiting ? null : eventId });

      if (targetEvent && !isWaiting) {
        setNextEvent(targetEvent);
        setFollowingEvent(secondEvent);
        setHasEvents(true);
        if (!hasEvents) triggerBubble(targetEvent, secondEvent);
      } else {
        setHasEvents(false);
        if (!isWaiting) { setNextEvent(null); setFollowingEvent(null); }
      }
    } catch (err) { console.error(err); }
  };

  const triggerBubble = (event: CalendarEvent, second?: CalendarEvent | null) => {
    if (manualWaitEventIdRef.current) return;
    const now = new Date().getTime();
    const diff1 = Math.max(0, Math.floor((new Date(event.start_time).getTime() - now) / 60000));
    setNyangMessage(`${event.title} 시작까지 ${diff1}분!`);
    
    if (second) {
      const diff2 = Math.max(0, Math.floor((new Date(second.start_time).getTime() - now) / 60000));
      setFollowingMessage(`${second.title}도 ${diff2}분 남았다냥!`);
    } else {
      setFollowingMessage("");
    }
    
    setShowNyangBubble(true);
    setTimeout(() => setShowNyangBubble(false), 7000);
  };

  const handleManualWait = async () => {
    setHasEvents(false);
    setShowNyangBubble(false);
    if (nextEvent) {
      manualWaitEventIdRef.current = `${nextEvent.title}-${nextEvent.start_time}`;
      await invoke("mark_manual_sleep");
    }
    const btnWin = getCurrentWebviewWindow() as any;
    btnWin.hide();
    const pos = await btnWin.outerPosition();
    const monitor = await btnWin.currentMonitor();
    if (monitor) {
      const f = monitor.scaleFactor;
      const x = pos.x / f; const y = pos.y / f;
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
      bubbleIntervalRef.current = setInterval(() => { triggerBubble(nextEvent, followingEvent); }, 20000);
    } else {
      if (bubbleIntervalRef.current) clearInterval(bubbleIntervalRef.current);
      setShowNyangBubble(false);
    }
    return () => { if (bubbleIntervalRef.current) clearInterval(bubbleIntervalRef.current); };
  }, [hasEvents, nextEvent?.title, followingEvent?.title]);

  useEffect(() => {
    if (hasEvents) setShowCalendar(false);
  }, [hasEvents]);

  if (windowLabel === "main") {
    return (
      <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-start bg-transparent overflow-hidden select-none pt-2">
        <div className="pointer-events-auto flex-shrink-0">
          <Cat 
            onCatClick={() => { if (!hasEvents) setShowCalendar(!showCalendar); }} 
            isSleeping={!hasEvents} 
            isMoving={isActuallyMoving}
            facingRight={facingRight}
          />      
        </div>
        <div className="w-full flex flex-col items-center gap-1 flex-shrink-0">
          {hasEvents && showNyangBubble && (
            <div className="flex flex-col items-center gap-1 pointer-events-none z-50">
              <SpeechBubble message={nyangMessage} isVisible={true} />
              {followingMessage && <SpeechBubble message={followingMessage} isVisible={true} />}
            </div>
          )}
          {showCalendar && (
            <div className="z-[9999] pointer-events-auto">
              <CalendarWidget isVisible={showCalendar} onClose={() => setShowCalendar(false)} />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (windowLabel === "sleep-button") {
    return (
      <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-transparent overflow-hidden">
        <button onClick={handleManualWait} style={{ background: 'transparent', border: 'none', padding: 0, outline: 'none', cursor: 'pointer' }} className="active:opacity-70 pointer-events-auto">
          <img src="/wait_2.png?v=1" alt="기다리기" className="w-12 h-auto block" style={{ imageRendering: 'pixelated' }} />
        </button>
      </div>
    );
  }
  return null;
}
export default App;
