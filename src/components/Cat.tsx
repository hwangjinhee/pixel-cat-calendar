import { motion, AnimatePresence } from "framer-motion";

interface CatProps {
  onCatClick: () => void;
  isSleeping: boolean;
  isMoving?: boolean;
  facingRight?: boolean;
}

export const Cat = ({ onCatClick, isSleeping, isMoving, facingRight }: CatProps) => {
  const getCatSrc = () => {
    if (isSleeping) return "/lying_cat.gif?v=2";
    if (isMoving) return "/walking_cat_v2.gif?v=2";
    return "/sitting_cat.gif?v=2";
  };

  const stateKey = isSleeping ? "sleeping" : isMoving ? "moving" : "sitting";

  return (
    <div 
      style={{ 
        width: "120px", 
        height: "120px", 
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        backgroundColor: "transparent",
        zIndex: 50
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. 드래그 영역 */}
      <div 
        data-tauri-drag-region
        style={{
          position: "absolute",
          top: 0, left: 0, width: "120px", height: "48px",
          zIndex: 60, cursor: "move", backgroundColor: "rgba(0,0,0,0)"
        }}
      />

      {/* 2. 클릭 영역 */}
      <div 
        onClick={(e) => { e.stopPropagation(); onCatClick(); }}
        style={{
          position: "absolute",
          bottom: 0, left: 0, width: "120px", height: "72px",
          zIndex: 60, cursor: "pointer", backgroundColor: "rgba(0,0,0,0)", pointerEvents: "auto"
        }}
      />

      {/* 3. 시각적 이미지 (AnimatePresence로 겹침 방지) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={stateKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, scaleX: facingRight ? -1.0 : 1.0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ pointerEvents: "none", zIndex: 55 }}
        >
          <img 
            src={getCatSrc()} 
            alt="cat"
            draggable="false"
            style={{ 
              width: "100px", 
              height: "100px", 
              imageRendering: "pixelated",
              display: "block"
            }}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
