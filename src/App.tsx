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
      
      console.log(`--- [${new Date().toLocaleTimeString()}] Checking ${events.length} events ---`);
      
      let foundActive = false;
      let targetEvent: CalendarEvent | null = null;

      for (const event of events) {
        const startTime = new Date(event.start_time).getTime();
        const diffMs = startTime - now;
        const diffMins = diffMs / 60000;

        // 시작 10분 전 ~ 시작 직전(0분) 사이만 활성
        // diffMins가 0 이하(과거)이거나 10 초과(먼 미래)면 무시
        if (diffMins > 0 && diffMins <= 10) {
          console.log(`>> ACTIVE: ${event.title} (Starts in ${diffMins.toFixed(2)}m)`);
          foundActive = true;
          targetEvent = event;
          break; 
        } else {
          if (diffMins <= 0 && diffMins > -10) {
            console.log(`>> PASSED: ${event.title} (Started ${Math.abs(diffMins).toFixed(2)}m ago)`);
          }
        }
      }
      
      if (foundActive && targetEvent) {
        setHasEvents(true);
        setNextEvent(targetEvent);
      } else {
        console.log(">> NO ACTIVE EVENTS: Sleeping...");
        setHasEvents(false);
        setNextEvent(null);
        setShowNyangBubble(false);
        setNyangMessage("");
      }
      
      await invoke("set_cat_following", { following: foundActive });
    } catch (err) {
      console.error("CheckEvents Error:", err);
      // 에러 발생 시 안전하게 취침 모드로 전환
      setHasEvents(false);
      setNextEvent(null);
      setShowNyangBubble(false);
    }
  };

  // hasEvents 상태 변경 감지 로그
  useEffect(() => {
    console.log("Cat State:", hasEvents ? "AWAKE 🐱" : "SLEEPING 😴");
  }, [hasEvents]);

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

      // 남은 시간 계산
      const startTime = new Date(currentEvent.start_time);
      const now = new Date();
      const diffMs = startTime.getTime() - now.getTime();
      const diffMins = Math.max(0, Math.floor(diffMs / 60000));

      setNyangMessage(`${currentEvent.title} 시작까지 ${diffMins}분 남았다냥!`);
      setShowNyangBubble(true);

      // 8초 뒤에 닫기
      setTimeout(() => setShowNyangBubble(false), 8000);
    };

    // 처음 한 번 실행
    showBubble();

    // 15초마다 실행 (nextEvent 변경에 의해 재시작되지 않음)
    const interval = setInterval(showBubble, 15000);
    return () => clearInterval(interval);
  }, []); // 의존성 배열을 비워 타이머가 한 번만 설정되게 함

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-transparent select-none pointer-events-none">
      
      {/* 1. 고양이 레이어 - 화면 정중앙 고정 */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto z-10 w-[120px] h-[120px] flex items-center justify-center">
        <Cat 
          onCatClick={() => setShowCalendar(!showCalendar)} 
          isSleeping={!hasEvents}
          isMoving={isActuallyMoving}
          facingRight={facingRight}
        />      </div>

      {/* 2. 말풍선 레이어 - 고양이 정중앙 아래쪽에 배치 */}
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
            top: '12px',    // 고양이 중심(0,0)에서 12px 아래 (고양이 배 밑에 바짝 밀착)
            transform: 'translateX(-50%)', // 말풍선 자체를 정중앙 정렬
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
