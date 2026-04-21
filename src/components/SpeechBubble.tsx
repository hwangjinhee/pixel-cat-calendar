import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SpeechBubbleProps {
  message: string;
  isVisible: boolean;
}

export const SpeechBubble = ({ message, isVisible }: SpeechBubbleProps) => {
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0);

  // Typing effect
  useEffect(() => {
    if (!isVisible) {
      setDisplayedText("");
      setIndex(0);
      return;
    }

    if (index < message.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + message[index]);
        setIndex((prev) => prev + 1);
      }, 50); // 타이핑 속도
      return () => clearTimeout(timeout);
    }
  }, [index, message, isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -5 }}
          className="relative z-[1000] flex justify-center items-start overflow-visible"
        >
          {/* 발끝 밀착 고정 크기 말풍선 (꼬리 제거) */}
          <div 
            style={{
              backgroundColor: 'white',
              border: '2px solid black',
              padding: '6px 10px',
              boxShadow: '3px 3px 0px 0px rgba(0,0,0,1)',
              width: '140px',
              height: '45px',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              zIndex: 1000,
              boxSizing: 'border-box',
              overflow: 'hidden'
            }}
          >
            <p 
              className="m-0 leading-tight text-black"
              style={{ 
                fontSize: '9px',
                fontFamily: 'sans-serif',
                wordBreak: 'break-all', 
                whiteSpace: 'normal',
                textAlign: 'left',
                width: '100%'
              }}
            >
              {displayedText}
              <span className="inline-block w-1 h-3 bg-black ml-1 animate-pulse" />
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
