import { useRef } from "react";
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
        width: "150px", 
        height: "150px", 
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none"
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. 바깥쪽 드래그 전용 영역 (Tauri 속성 활용) */}
      <div 
        data-tauri-drag-region
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          cursor: "move",
          zIndex: 1,
          backgroundColor: "rgba(0,0,0,0.01)" // 마우스 이벤트를 받기 위한 미세 배경
        }}
      />

      {/* 2. 안쪽 클릭 전용 영역 (고양이 몸체 부분) */}
      <div 
        onClick={(e) => {
          e.stopPropagation();
          console.log("Cat Body Clicked!");
          onCatClick();
        }}
        style={{
          position: "relative",
          width: "100px",
          height: "100px",
          zIndex: 10, // 드래그 영역보다 위로 배치
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "auto" // 클릭 강제 활성화
        }}
      >
        <motion.div
          animate={{ scaleX: facingRight ? -1.0 : 1.0 }}
          transition={{ duration: 0.3 }}
          style={{ pointerEvents: "none" }} // 이미지는 클릭을 통과시켜 부모 div가 받게 함
        >
          <img 
            src={getCatSrc()} 
            alt="cat"
            draggable="false"
            style={{ 
              width: "100px", 
              height: "100px", 
              imageRendering: "pixelated"
            }}
          />
        </motion.div>
      </div>
    </div>
  );
};
