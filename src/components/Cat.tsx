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
      // 멈췄고 평상시라면 앉기
      if (state === "WALKING" || state === "STANDING_UP") {
        setState("SITTING_DOWN");
        const timer = setTimeout(() => setState("SITTING"), 400);
        return () => clearTimeout(timer);
      } else {
        setState("SITTING");
      }
    }
  }, [isMoving, isSleeping]);

  const getCatDisplay = () => {
    switch (state) {
      case "WALKING":
        return { src: "/walking_cat_v2.gif", scaleY: 1, y: 0 };
      case "STANDING_UP":
      case "SITTING_DOWN":
        return { src: "/standing_cat.png", scaleY: 1, y: 0 };
      case "SITTING":
        return { src: "/sitting_cat.gif", scaleY: 1, y: 5 }; // sitting_cat.gif 적용
      case "LYING_DOWN":
      case "SLEEPING":
        return { src: "/lying_cat.gif", scaleY: 1, y: 15 }; // lying_cat.gif 적용
      default:
        return { src: "/sitting_cat.gif", scaleY: 1, y: 5 };
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
