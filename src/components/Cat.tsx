import { useRef } from "react";
import { motion } from "framer-motion";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

const appWindow = getCurrentWebviewWindow();

interface CatProps {
  onCatClick: () => void;
  isSleeping: boolean;
  isMoving?: boolean;
  facingRight?: boolean;
}

export const Cat = ({ onCatClick, isSleeping, isMoving, facingRight }: CatProps) => {
  const mouseDownTime = useRef<number>(0);

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
          mouseDownTime.current = Date.now();
          appWindow.startDragging();
        }
      }}
      onMouseUp={(e) => {
        if (e.button === 0) {
          const clickDuration = Date.now() - mouseDownTime.current;
          // 200ms 미만으로 짧게 눌렀다 떼면 클릭으로 간주
          if (clickDuration < 200) {
            onCatClick();
          }
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
