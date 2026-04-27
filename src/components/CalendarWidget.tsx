import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";

interface CalendarEvent {
  title: string;
  start_time: string;
  source: "google" | "outlook" | "apple";
}

interface CalendarWidgetProps {
  isVisible: boolean;
  onClose: () => void;
}

export const CalendarWidget = ({ isVisible, onClose }: CalendarWidgetProps) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const checkLoginStatus = async () => {
    try {
      const loggedIn = await invoke<boolean>("is_google_logged_in");
      setIsLoggedIn(loggedIn);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const allEvents = await invoke<CalendarEvent[]>("get_all_events");
      setEvents(allEvents);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isVisible) {
      checkLoginStatus();
      fetchEvents();
    }
  }, [isVisible]);

  const handleLogin = async () => {
    try {
      await invoke("google_login");
      await checkLoginStatus();
      fetchEvents();
      onClose(); // 로그인 성공 시 위젯 닫기
    } catch (e) {
      console.error("Login failed:", e);
    }
  };

  const handleLogout = async () => {
    try {
      await invoke("google_logout");
      await checkLoginStatus();
      setEvents([]);
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          style={{ width: 'max-content' }}
          className="bg-black/80 backdrop-blur-lg rounded-2xl p-3 border border-white/20 shadow-2xl z-50 flex items-center justify-center"
        >
          {isLoggedIn ? (
            <button 
              onClick={handleLogout}
              style={{ 
                background: 'rgba(255, 255, 255, 0)', 
                border: 'none', 
                padding: 0, 
                margin: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              className="hover:opacity-80 active:scale-95 transition-all w-16"
            >
              <img 
                src="/glogout.png?v=1" 
                alt="Google Logout" 
                className="w-full h-auto block pointer-events-none"
                style={{ imageRendering: 'pixelated' }}
              />
            </button>
          ) : (
            <button 
              onClick={handleLogin}
              style={{ 
                background: 'rgba(255, 255, 255, 0)', 
                border: 'none', 
                padding: 0, 
                margin: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              className="hover:opacity-80 active:scale-95 transition-all w-16"
            >
              <img 
                src="/gsign.png?v=1" 
                alt="Google Login" 
                className="w-full h-auto block pointer-events-none"
                style={{ imageRendering: 'pixelated' }}
              />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
