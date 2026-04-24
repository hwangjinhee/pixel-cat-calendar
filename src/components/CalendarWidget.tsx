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

  const fetchEvents = async () => {
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
    if (isVisible) fetchEvents();
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          className="absolute bottom-16 w-56 bg-black/80 backdrop-blur-lg rounded-2xl p-4 border border-white/20 shadow-2xl z-50"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Schedule</h2>
            <div className="flex gap-2">
              <button 
                onClick={async () => {
                  try {
                    await invoke("google_login");
                    fetchEvents();
                  } catch (e) {
                    console.error("Login failed:", e);
                  }
                }}
                className="text-[9px] bg-white/10 hover:bg-white/20 text-white px-2 py-0.5 rounded border border-white/10 transition-colors"
              >
                G Login
              </button>
              <button onClick={onClose} className="text-white/20 hover:text-white/100">&times;</button>
            </div>
          </div>

          <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="text-[10px] text-white/30 text-center py-2">Loading...</div>
            ) : events.length === 0 ? (
              <div className="text-[10px] text-white/30 text-center py-2">No events</div>
            ) : (
              events.map((event, idx) => (
                <div key={idx} className="bg-white/5 rounded-lg p-2 border border-white/5">
                  <div className="text-[9px] font-bold text-orange-400 mb-1">
                    {new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="text-[10px] text-white/90 truncate font-medium">{event.title}</div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
