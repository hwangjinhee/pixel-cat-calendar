import { motion } from "framer-motion";

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
        zIndex: 50 // 위젯(999)보다 낮게 설정
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. 드래그 전용 상단 영역 (40%) - 이미지 크기 내로 제한 */}
      <div 
        data-tauri-drag-region
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "120px", // 명시적 고정
          height: "48px",  // 120 * 0.4
          zIndex: 60,
          cursor: "move",
          backgroundColor: "rgba(0,0,0,0)"
        }}
      />

      {/* 2. 클릭 전용 하단 영역 (60%) - 이미지 크기 내로 제한 */}
      <div 
        onClick={(e) => {
          e.stopPropagation();
          onCatClick();
        }}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "120px", // 명시적 고정
          height: "72px",  // 120 * 0.6
          zIndex: 60,
          cursor: "pointer",
          backgroundColor: "rgba(0,0,0,0)",
          pointerEvents: "auto"
        }}
      />

      {/* 3. 시각적 고양이 이미지 */}
      <motion.div
        animate={{ scaleX: facingRight ? -1.0 : 1.0 }}
        transition={{ duration: 0.3 }}
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
    </div>
  );
};
