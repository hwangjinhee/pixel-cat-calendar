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
        flexDirection: "column", // 상하 분할을 위해 flex-column 사용
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none"
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. 드래그 전용 상단 영역 (고양이 머리 부분 - 40%) */}
      <div 
        data-tauri-drag-region
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "40%", // 상단 40%
          zIndex: 20,
          cursor: "move",
          backgroundColor: "rgba(0,0,0,0.01)" // 마우스 이벤트 포착용 미세 배경
        }}
        title="이 부분을 잡고 드래그하세요"
      />

      {/* 2. 클릭 전용 하단 영역 (고양이 몸통 부분 - 60%) */}
      <div 
        onClick={(e) => {
          e.stopPropagation();
          onCatClick();
        }}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: "60%", // 하단 60%
          zIndex: 20,
          cursor: "pointer",
          backgroundColor: "rgba(0,0,0,0.01)" // 클릭 감도용 미세 배경
        }}
        title="이 부분을 클릭해서 연동 위젯을 여세요"
      />

      {/* 3. 시각적 고양이 이미지 (이벤트 투과) */}
      <motion.div
        animate={{ scaleX: facingRight ? -1.0 : 1.0 }}
        transition={{ duration: 0.3 }}
        style={{ pointerEvents: "none", zIndex: 10 }}
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
