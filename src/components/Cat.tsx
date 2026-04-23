import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface CatProps {
  onCatClick: () => void;
  isSleeping: boolean;
  isMoving?: boolean;
  facingRight?: boolean;
}

type CatState = "WALKING" | "SITTING" | "STANDING_UP" | "SITTING_DOWN" | "LYING_DOWN" | "SLEEPING";

export const Cat = ({ onCatClick, isSleeping, isMoving, facingRight }: CatProps) => {
  const [state, setState] = useState<CatState>("SITTING");

  useEffect(() => {
    if (isMoving) {
      // 움직이는 중이라면(복귀 중 포함) 걷기 상태 우선
      if (state !== "WALKING" && state !== "STANDING_UP") {
        setState("STANDING_UP");
        const timer = setTimeout(() => setState("WALKING"), 400);
        return () => clearTimeout(timer);
      } else {
        setState("WALKING");
      }
    } else if (isSleeping) {
      // 멈췄고 취침 모드라면 눕기
      if (state !== "SLEEPING" && state !== "LYING_DOWN") {
        setState("LYING_DOWN");
        const timer = setTimeout(() => setState("SLEEPING"), 600);
        return () => clearTimeout(timer);
      }
    } else {
      // 멈췄고 평상시(Awake)라면 바로 앉지 않고 서서 대기 (자연스러운 연결)
      if (state === "WALKING") {
        setState("STANDING_UP");
      } else if (state === "STANDING_UP") {
        // 서서 대기하는 시간을 길게 주거나 계속 유지
        // 여기서는 앉기까지의 지연 시간을 대폭 늘리거나, 
        // 깨어있을 때는 계속 서 있게 하려면 setState("SITTING")으로 가는 타이머를 제거하면 됩니다.
        const timer = setTimeout(() => setState("SITTING"), 2000); // 2초 뒤에 앉도록 변경
        return () => clearTimeout(timer);
      }
    }
  }, [isMoving, isSleeping]);

  const getCatDisplay = () => {
    switch (state) {
      case "WALKING":
        return { src: "/walking_cat_v2.gif?v=2", scaleY: 1, y: 0 };
      case "STANDING_UP":
      case "SITTING_DOWN":
        // 서있는 상태에서도 새 고양이 이미지를 사용하도록 걷기 이미지 사용
        return { src: "/walking_cat_v2.gif?v=2", scaleY: 1, y: 0 };
      case "SITTING":
        return { src: "/sitting_cat.gif?v=2", scaleY: 1, y: 5 };
      case "LYING_DOWN":
      case "SLEEPING":
        return { src: "/lying_cat.gif?v=2", scaleY: 1, y: 15 };
      default:
        return { src: "/sitting_cat.gif?v=2", scaleY: 1, y: 5 };
    }
  };

  const display = getCatDisplay();

  return (
    <motion.div
      onClick={(e) => {
        e.stopPropagation();
        onCatClick();
      }}
      className="cursor-pointer relative flex items-center justify-center"
      style={{ width: "96px", height: "96px" }}
    >
      <motion.div
        animate={{ 
          y: display.y,
          scaleX: facingRight ? -1.0 : 1.0,
          scaleY: 1.0
        }}
        transition={{ duration: 0.3 }}
        className="w-full h-full flex items-center justify-center"
      >
        <img 
          src={display.src} 
          alt="pixel cat"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            imageRendering: "pixelated"
          }}
        />
      </motion.div>

      {/* 취침 모드 말풍선 제거됨 */}
      {/* 그림자 */}
      <div style={{
        position: 'absolute',
        bottom: '22px',  
        left: '20px',    
        width: '56px',
        height: '6px',
        backgroundColor: 'rgba(0,0,0,0.15)',
        borderRadius: '50%',
        filter: 'blur(4px)',
        zIndex: -1
      }} />
    </motion.div>
  );
};
