import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";

interface CalendarWidgetProps {
  isVisible: boolean;
  onClose: () => void;
}

export const CalendarWidget = ({ isVisible, onClose }: CalendarWidgetProps) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const checkLoginStatus = async () => {
    try {
      const loggedIn = await invoke<boolean>("is_google_logged_in");
      setIsLoggedIn(loggedIn);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (isVisible) checkLoginStatus();
  }, [isVisible]);

  const handleLogin = async () => {
    try {
      await invoke("google_login");
      await checkLoginStatus();
      onClose();
    } catch (e) { console.error("Login failed:", e); }
  };

  const handleLogout = async () => {
    try {
      await invoke("google_logout");
      await checkLoginStatus();
    } catch (e) { console.error("Logout failed:", e); }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          style={{ width: '80px', height: '48px' }} // 박스 크기 명시
          className="bg-black/80 backdrop-blur-lg rounded-2xl border border-white/20 shadow-2xl z-[1000] flex items-center justify-center overflow-visible"
        >
          {isLoggedIn ? (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleLogout();
              }}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                padding: 0, 
                margin: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '64px',
                height: '32px'
              }}
              className="hover:opacity-80 active:scale-95 transition-all"
            >
              <img 
                src="/glogout.png?v=1" 
                alt="Logout" 
                style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
              />
            </button>
          ) : (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleLogin();
              }}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                padding: 0, 
                margin: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '64px',
                height: '32px'
              }}
              className="hover:opacity-80 active:scale-95 transition-all"
            >
              <img 
                src="/gsign.png?v=1" 
                alt="Login" 
                style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
              />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
