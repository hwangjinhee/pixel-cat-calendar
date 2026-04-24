import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Cat } from "./components/Cat";
import { CalendarWidget } from "./components/CalendarWidget";
import { SpeechBubble } from "./components/SpeechBubble";

interface CalendarEvent {
  title: string;
  start_time: string;
  source: string;
}

function App() {
  const [showCalendar, setShowCalendar] = useState(false);
  const [hasEvents, setHasEvents] = useState(false);
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
  const [showNyangBubble, setShowNyangBubble] = useState(false);
  const [nyangMessage, setNyangMessage] = useState("");
  const [isActuallyMoving, setIsActuallyMoving] = useState(false);
  const [facingRight, setFacingRight] = useState(false);
  const [isManualSleep, setIsManualSleep] = useState(false); // 수동 취침 상태

  // Tauri 백엔드에서 전송하는 움직임 상태 리스닝
  useEffect(() => {
    let unlisten: any;
    const setupListen = async () => {
      unlisten = await listen<{is_moving: boolean, facing_right: boolean}>("cat-move-state", (event) => {
        setIsActuallyMoving(event.payload.is_moving);
        setFacingRight(event.payload.facing_right);
      });
    };
    setupListen();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // nextEvent를 최신 상태로 유지하기 위한 ref
  const nextEventRef = useRef<CalendarEvent | null>(null);
  const hasEventsRef = useRef(false);

  useEffect(() => {
    nextEventRef.current = nextEvent;
    hasEventsRef.current = hasEvents;
  }, [nextEvent, hasEvents]);

  const checkEvents = async () => {
    try {
      const events = await invoke<CalendarEvent[]>("get_all_events");
      const now = new Date().getTime();
      
      let foundActive = false;
      let targetEvent: CalendarEvent | null = null;

      for (const event of events) {
        const startTime = new Date(event.start_time).getTime();
        const diffMs = startTime - now;
        const diffMins = diffMs / 60000;

        if (diffMins > 0 && diffMins <= 10) {
          foundActive = true;
          targetEvent = event;
          break; 
        }
      }
      
      if (foundActive && targetEvent) {
        // 수동 취침 중인데 같은 일정이면 깨우지 않음
        const isSameEvent = nextEventRef.current && 
                            nextEventRef.current.title === targetEvent.title && 
                            nextEventRef.current.start_time === targetEvent.start_time;

        if (!isManualSleep || !isSameEvent) {
          setHasEvents(true);
          setNextEvent(targetEvent);
          if (!isSameEvent) setIsManualSleep(false); // 새로운 일정이면 수동 취침 해제
        }
      } else {
        setHasEvents(false);
        setNextEvent(null);
        setIsManualSleep(false); // 활성 일정 없으면 수동 취침 초기화
      }
      
      // 실제 고양이가 깨어있는지(hasEvents)에 따라 팔로잉 결정
      await invoke("set_cat_following", { following: hasEventsRef.current });
    } catch (err) {
      console.error("CheckEvents Error:", err);
      setHasEvents(false);
    }
  };

  const handleManualSleep = async () => {
    setIsManualSleep(true);
    setHasEvents(false);
    await invoke("set_cat_following", { following: false });
  };

  // 1. 일정 체크 타이머 (5초)
  useEffect(() => {
    checkEvents();
    const interval = setInterval(checkEvents, 5000);
    return () => clearInterval(interval);
  }, []);

  // 2. 냥 말풍선 노출 타이머 (정확히 15초 주기)
  useEffect(() => {
    const showBubble = () => {
      const currentEvent = nextEventRef.current;
      const currentHasEvents = hasEventsRef.current;

      if (!currentHasEvents || !currentEvent) return;

      const startTime = new Date(currentEvent.start_time);
      const now = new Date();
      const diffMs = startTime.getTime() - now.getTime();
      const diffMins = Math.max(0, Math.floor(diffMs / 60000));

      setNyangMessage(`${currentEvent.title} 시작까지 ${diffMins}분 남았다냥!`);
      setShowNyangBubble(true);

      setTimeout(() => setShowNyangBubble(false), 8000);
    };

    showBubble();
    const interval = setInterval(showBubble, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-transparent select-none pointer-events-none">
      
      {/* 1. 고양이 레이어 */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-10 w-[96px] h-[96px] flex items-center justify-center">
        <Cat 
          onCatClick={() => setShowCalendar(!showCalendar)} 
          isSleeping={!hasEvents}
          isMoving={isActuallyMoving}
          facingRight={facingRight}
        />      
        
        {/* 수동 재우기 버튼 (깨어있을 때만 노출) */}
        {hasEvents && (
          <button 
            onClick={handleManualSleep}
            className="absolute -right-12 top-0 bg-white border-2 border-black px-2 py-1 text-[10px] font-bold hover:bg-gray-200 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] pointer-events-auto"
            style={{ imageRendering: 'pixelated' }}
          >
            재우기
          </button>
        )}
      </div>

      {/* 2. 말풍선 레이어 */}
      <div 
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: '0px',
          height: '0px',
          overflow: 'visible',
          zIndex: 999
        }}
      >
        <div 
          style={{
            position: 'absolute',
            left: '0px',
            top: '24px',
            transform: 'translateX(-50%)',
            width: 'max-content',
            height: 'max-content',
            overflow: 'visible',
            display: 'flex',
            justifyContent: 'center'
          }}
        >
          <SpeechBubble message={nyangMessage} isVisible={showNyangBubble} />
        </div>
      </div>

      {/* 3. 위젯 레이어 */}
      <div className="absolute left-1/2 top-1/2 w-0 h-0 overflow-visible pointer-events-auto z-[60]">
        <div className="absolute left-[65px] top-0 -translate-y-1/2">
          <CalendarWidget 
            isVisible={showCalendar} 
            onClose={() => setShowCalendar(false)}
          />
        </div>
      </div>

    </div>
  );
}

export default App;
