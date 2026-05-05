import { motion } from "framer-motion";

interface CatProps {
  onCatClick: () => void;
  state: "WALKING" | "SITTING" | "SLEEPING";
  facingRight: boolean;
}

export const Cat = ({ onCatClick, state, facingRight }: CatProps) => {
  const getCatSrc = () => {
    switch (state) {
      case "WALKING": return "/walking_cat_v2.gif?v=30";
      case "SITTING": return "/sitting_cat.gif?v=30";
      case "SLEEPING": return "/lying_cat.gif?v=30";
      default: return "/lying_cat.gif?v=30";
    }
  };

  return (
    <div 
      style={{ 
        width: "120px", height: "120px", position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        userSelect: "none", backgroundColor: "transparent", zIndex: 50
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div data-tauri-drag-region style={{ position: "absolute", top: 0, left: 0, width: "120px", height: "48px", zIndex: 60, cursor: "move", backgroundColor: "rgba(0,0,0,0)" }} />
      <div onClick={(e) => { e.stopPropagation(); onCatClick(); }} style={{ position: "absolute", bottom: 0, left: 0, width: "120px", height: "72px", zIndex: 60, cursor: "pointer", backgroundColor: "rgba(0,0,0,0)", pointerEvents: "auto" }} />

      <motion.div
        animate={{ scaleX: facingRight ? -1.0 : 1.0 }}
        transition={{ duration: 0.1 }}
        style={{ pointerEvents: "none", zIndex: 55 }}
      >
        <img 
          src={getCatSrc()} 
          alt="cat" 
          draggable="false" 
          style={{ width: "100px", height: "100px", imageRendering: "pixelated", display: "block" }} 
        />
      </motion.div>
    </div>
  );
};
