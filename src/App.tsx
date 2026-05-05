import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
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

type CatStateType = "WALKING" | "SITTING" | "SLEEPING";

function App() {
  const [windowLabel, setWindowLabel] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [catState, setCatState] = useState<CatStateType>("SLEEPING");
  const [isManualWaiting, setIsManualWaiting] = useState(false);
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
  const [followingEvent, setFollowingEvent] = useState<CalendarEvent | null>(null);
  const [showNyangBubble, setShowNyangBubble] = useState(false);
  const [nyangMessage, setNyangMessage] = useState("");
  const [followingMessage, setFollowingMessage] = useState("");
  const [facingRight, setFacingRight] = useState(false);
  
  const bubbleIntervalRef = useRef<any>(null);

  useEffect(() => {
    const label = getCurrentWebviewWindow().label;
    setWindowLabel(label);

    const unlistenCat = listen<{state: CatStateType, facing_right: boolean}>("cat-state", (event) => {
      setCatState(event.payload.state);
      setFacingRight(event.payload.facing_right);
    });

    const unlistenButton = listen<{event: CalendarEvent | null, isWaiting: boolean}>("update-button-ui", (event) => {
      setNextEvent(event.payload.event);
      setIsManualWaiting(event.payload.isWaiting);
    });

    return () => { unlistenCat.then(f => f()); unlistenButton.then(f => f()); };
  }, []);

  useEffect(() => {
    if (windowLabel !== "main") return;
    const updateWindowSize = async () => {
      try {
        const mainWin = getCurrentWebviewWindow();
        const currentSize = await mainWin.innerSize();
        let targetWidth = 150;
        let targetHeight = 150;
        if (catState !== "SLEEPING" || showCalendar || isManualWaiting || showNyangBubble) {
          targetHeight = 350;
        }
        if (currentSize.width !== targetWidth || currentSize.height !== targetHeight) {
          await mainWin.setSize(new LogicalSize(targetWidth, targetHeight));
        }
      } catch (e) { console.error(e); }
    };
    updateWindowSize();
  }, [catState, showCalendar, isManualWaiting, showNyangBubble, windowLabel]);

  const checkEvents = async () => {
    if (windowLabel !== "main") return;

    try {
      const allEvents = await invoke<CalendarEvent[]>("get_all_events");
      const events = allEvents.filter(e => !e.title.includes("생일") && !e.title.toLowerCase().includes("birthday"));
      const now = new Date().getTime();
      
      let target: CalendarEvent | null = null;
      let second: CalendarEvent | null = null;

      for (const event of events) {
        const start = new Date(event.start_time).getTime();
        const diff = (start - now) / 60000;
        if (diff > 0 && diff <= 10) {
          if (!target) target = event;
          else if (!second) { second = event; break; }
        }
      }
      
      const eventId = target ? `${target.title}-${target.start_time}` : null;
      await invoke("sync_state", { eventId });

      // 백엔드에서 실시간 대기 상태 확인
      const isWaiting = await invoke<boolean>("is_waiting_active");
      
      await emit("update-button-ui", { event: target, isWaiting: isWaiting });
      setIsManualWaiting(isWaiting);

      if (target) {
        setNextEvent(target);
        setFollowingEvent(second);
        if (!isWaiting && catState === "SLEEPING") triggerBubble(target, second);
        else if (isWaiting) {
          const d1 = Math.max(0, Math.floor((new Date(target.start_time).getTime() - now) / 60000));
          setNyangMessage(`${target.title} ${d1}분 전! 대기 중이다냥!`);
          setShowNyangBubble(true);
        }
      } else {
        setNextEvent(null); setFollowingEvent(null);
      }
    } catch (err) { console.error(err); }
  };

  const triggerBubble = (event: CalendarEvent, second?: CalendarEvent | null) => {
    const now = new Date().getTime();
    const d1 = Math.max(0, Math.floor((new Date(event.start_time).getTime() - now) / 60000));
    setNyangMessage(`${event.title} ${d1}분 전!`);
    if (second) {
      const d2 = Math.max(0, Math.floor((new Date(second.start_time).getTime() - now) / 60000));
      setFollowingMessage(`${second.title}도 ${d2}분 남았다냥!`);
    } else { setFollowingMessage(""); }
    setShowNyangBubble(true);
    setTimeout(() => setShowNyangBubble(false), 7000);
  };

  const handleManualWait = async () => {
    if (nextEvent) {
      await invoke("mark_manual_sleep");
      setIsManualWaiting(true);
      await emit("update-button-ui", { event: nextEvent, isWaiting: true });
    }
    const wins = await getAllWebviewWindows();
    const mainWin = wins.find(w => w.label === "main") as any;
    const btnWin = wins.find(w => w.label === "sleep-button") as any;
    if (btnWin && mainWin) {
      const pos = await btnWin.outerPosition();
      const monitor = await btnWin.currentMonitor();
      if (monitor) {
        const f = monitor.scaleFactor;
        // 버튼이 왼쪽에 있으므로 고양이는 버튼의 오른쪽(+70) 아래(+20)로 이동
        await mainWin.setPosition(new LogicalPosition(pos.x / f + 70, pos.y / f + 20));
        await mainWin.setFocus(); 
      }
    }
    setShowNyangBubble(true);
  };

  const handleWakeUp = async () => {
    await invoke("reset_manual_sleep");
    setIsManualWaiting(false);
    await emit("update-button-ui", { event: nextEvent, isWaiting: false });
    if (windowLabel === "main") await checkEvents();
  };

  useEffect(() => {
    if (windowLabel === "main") {
      checkEvents();
      const interval = setInterval(checkEvents, 5000);
      return () => clearInterval(interval);
    }
  }, [windowLabel, nextEvent?.title, isManualWaiting]);

  useEffect(() => {
    const isAwake = catState !== "SLEEPING" || isManualWaiting;
    if (isAwake && nextEvent) {
      if (bubbleIntervalRef.current) clearInterval(bubbleIntervalRef.current);
      bubbleIntervalRef.current = setInterval(() => { triggerBubble(nextEvent, followingEvent); }, 20000);
    } else {
      if (bubbleIntervalRef.current) clearInterval(bubbleIntervalRef.current);
      setShowNyangBubble(false);
    }
    return () => { if (bubbleIntervalRef.current) clearInterval(bubbleIntervalRef.current); };
  }, [catState, isManualWaiting, nextEvent?.title, followingEvent?.title]);

  if (windowLabel === "main") {
    return (
      <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-start bg-transparent overflow-visible select-none pt-2">
        <div className="pointer-events-auto flex-shrink-0">
          <Cat 
            onCatClick={() => { if (catState === "SLEEPING" && !isManualWaiting) setShowCalendar(!showCalendar); }} 
            state={catState}
            facingRight={facingRight}
          />      
        </div>
        <div className="w-full flex flex-col items-center gap-1 flex-shrink-0">
          {showNyangBubble && (
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
        {nextEvent ? (
          <div className="pointer-events-auto">
            {isManualWaiting ? (
              <button onClick={handleWakeUp} style={{ background: 'transparent', border: 'none', padding: 0, outline: 'none', cursor: 'pointer' }} className="active:opacity-70">
                <img src="/up.png?v=1" alt="일어서기" className="w-10 h-auto block" style={{ imageRendering: 'pixelated' }} />
              </button>
            ) : (
              <button onClick={handleManualWait} style={{ background: 'transparent', border: 'none', padding: 0, outline: 'none', cursor: 'pointer' }} className="active:opacity-70">
                <img src="/wait_2.png?v=1" alt="기다리기" className="w-10 h-auto block" style={{ imageRendering: 'pixelated' }} />
              </button>
            )}
          </div>
        ) : null}
      </div>
    );
  }
  return null;
}
export default App;
