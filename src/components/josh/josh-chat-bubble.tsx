"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JoshChatPanel } from "./josh-chat-panel";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  activityType: string;
  title: string;
  description: string | null;
  contactId: string | null;
  createdAt: string;
}

export function JoshChatBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isPulsing, setIsPulsing] = useState(false);

  // Fetch unread activities on mount and periodically
  const fetchActivities = useCallback(async () => {
    try {
      const response = await fetch("/api/josh/activities");
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
        setUnreadCount(data.count || 0);
        
        // Pulse if there are new activities
        if (data.count > 0) {
          setIsPulsing(true);
          setTimeout(() => setIsPulsing(false), 2000);
        }
      }
    } catch (error) {
      console.error("Error fetching Josh activities:", error);
    }
  }, []);

  useEffect(() => {
    fetchActivities();
    
    // Poll for new activities every 30 seconds
    const interval = setInterval(fetchActivities, 30000);
    return () => clearInterval(interval);
  }, [fetchActivities]);

  const handleMarkRead = async (ids: string[]) => {
    try {
      await fetch("/api/josh/activities/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      
      // Update local state
      setActivities((prev) => prev.filter((a) => !ids.includes(a.id)));
      setUnreadCount((prev) => Math.max(0, prev - ids.length));
    } catch (error) {
      console.error("Error marking activities as read:", error);
    }
  };

  return (
    <>
      {/* Chat Panel */}
      <JoshChatPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        activities={activities}
        onMarkRead={handleMarkRead}
      />

      {/* Floating Bubble */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-4 right-4 w-14 h-14 rounded-full shadow-lg z-50",
          "bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700",
          "transition-all duration-200 hover:scale-105",
          isPulsing && "animate-pulse"
        )}
        size="icon"
      >
        <Bot className="w-6 h-6 text-white" />
        
        {/* Unread Badge */}
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-in zoom-in">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>
    </>
  );
}

