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
    // 1. 취침 모드(isSleeping=true) 최우선 처리
    if (isSleeping) {
      if (state !== "SLEEPING" && state !== "LYING_DOWN") {
        setState("LYING_DOWN");
        const timer = setTimeout(() => setState("SLEEPING"), 600);
        return () => clearTimeout(timer);
      }
      return;
    }

    // 2. 활성 모드 처리
    if (isMoving) {
      if (state !== "WALKING" && state !== "STANDING_UP") {
        setState("STANDING_UP");
        const timer = setTimeout(() => setState("WALKING"), 400);
        return () => clearTimeout(timer);
      } else {
        setState("WALKING");
      }
    } else {
      if (state === "WALKING" || state === "STANDING_UP") {
        setState("SITTING_DOWN");
        const timer = setTimeout(() => setState("SITTING"), 400);
        return () => clearTimeout(timer);
      } else {
        setState("SITTING");
      }
    }
  }, [isMoving, isSleeping, state]); // state도 의존성에 추가하여 시퀀스 보장

  const getCatDisplay = () => {
    switch (state) {
      case "WALKING":
        return { src: "/walking_cat_v2.gif?v=2", scaleY: 1, y: 0 };
      case "STANDING_UP":
      case "SITTING_DOWN":
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
      className="cursor-pointer relative flex items-center justify-center pointer-events-auto"
      style={{ width: "96px", height: "96px", cursor: 'pointer' }}
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
    </motion.div>
  );
};
