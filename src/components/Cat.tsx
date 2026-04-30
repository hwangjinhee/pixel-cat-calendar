import { useRef } from "react";
import { motion } from "framer-motion";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";

const appWindow = getCurrentWebviewWindow();

interface CatProps {
  onCatClick: () => void;
  isSleeping: boolean;
  isMoving?: boolean;
  facingRight?: boolean;
}

export const Cat = ({ onCatClick, isSleeping, isMoving, facingRight }: CatProps) => {
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  const getCatSrc = () => {
    if (isSleeping) return "/lying_cat.gif?v=2";
    if (isMoving) return "/walking_cat_v2.gif?v=2";
    return "/sitting_cat.gif?v=2";
  };

  return (
    <div 
      style={{ 
        width: "120px", 
        height: "120px", 
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255, 255, 255, 0.01)", 
        cursor: "move"
      }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        if (e.button === 0) {
          mouseDownPos.current = { x: e.screenX, y: e.screenY };
          appWindow.startDragging();
        }
      }}
      onMouseUp={(e) => {
        if (e.button === 0 && mouseDownPos.current) {
          const deltaX = Math.abs(e.screenX - mouseDownPos.current.x);
          const deltaY = Math.abs(e.screenY - mouseDownPos.current.y);
          
          // 마우스가 거의 움직이지 않았을 때만 클릭으로 간주 (5px 이내)
          if (deltaX < 5 && deltaY < 5) {
            console.log("Cat Clicked (Distance based)");
            onCatClick();
          }
          mouseDownPos.current = null;
        }
      }}
    >
      <motion.div
        animate={{ scaleX: facingRight ? -1.0 : 1.0 }}
        transition={{ duration: 0.3 }}
        style={{ pointerEvents: "none" }}
      >
        <img 
          src={getCatSrc()} 
          alt="cat"
          draggable="false"
          style={{ width: "100px", height: "100px", imageRendering: "pixelated" }}
        />
      </motion.div>
    </div>
  );
};
