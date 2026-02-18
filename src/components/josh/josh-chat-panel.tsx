"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, Bot, Sparkles, Mail, UserPlus, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JoshMessage } from "./josh-message";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  activityType: string;
  title: string;
  description: string | null;
  contactId: string | null;
  createdAt: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface JoshChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activities: Activity[];
  onMarkRead: (ids: string[]) => void;
}

export function JoshChatPanel({
  isOpen,
  onClose,
  activities,
  onMarkRead,
}: JoshChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Load chat history from database when panel opens
  useEffect(() => {
    if (isOpen && !hasLoadedHistory) {
      loadChatHistory();
    }
  }, [isOpen, hasLoadedHistory]);

  const loadChatHistory = async () => {
    try {
      const response = await fetch("/api/josh/chat");
      if (response.ok) {
        const data = await response.json();
        if (data.messages && data.messages.length > 0) {
          // Load persisted messages
          const loadedMessages: Message[] = data.messages.map((m: { id: string; role: string; content: string; createdAt: string }) => ({
            id: m.id,
            role: m.role === "USER" ? "user" : "assistant",
            content: m.content,
            timestamp: new Date(m.createdAt),
          }));
          setMessages(loadedMessages);
        } else {
          // No history - show welcome message
          const welcomeMessage = generateWelcomeMessage(activities);
          setMessages([
            {
              id: "welcome",
              role: "assistant",
              content: welcomeMessage,
              timestamp: new Date(),
            },
          ]);
        }
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
      // Show welcome on error
      const welcomeMessage = generateWelcomeMessage(activities);
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: welcomeMessage,
          timestamp: new Date(),
        },
      ]);
    }
    
    setHasLoadedHistory(true);

    // Mark activities as read after loading
    if (activities.length > 0) {
      const activityIds = activities.map((a) => a.id);
      onMarkRead(activityIds);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Call Josh chat API
      const response = await fetch("/api/josh/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input.trim() }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || "I'm not sure how to help with that. Try asking about your emails or contacts!",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed bottom-24 right-4 bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50",
        "animate-in slide-in-from-bottom-5 fade-in duration-200"
      )}
      style={{
        width: "500px",
        maxWidth: "calc(100vw - 2rem)",
        height: "750px",
        maxHeight: "calc(100vh - 7rem)",
      }}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-blue-500/10 to-purple-500/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white shadow-lg">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold">Josh</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Your AI assistant
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Activity Summary (if any new activities) */}
      {activities.length > 0 && (
        <div className="flex-shrink-0 px-4 py-3 border-b bg-muted/50">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Recent Activity
          </p>
          <div className="space-y-1.5">
            {activities.slice(0, 3).map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
            {activities.length > 3 && (
              <p className="text-xs text-muted-foreground">
                +{activities.length - 3} more activities
              </p>
            )}
          </div>
        </div>
      )}

      {/* Messages - Scrollable area */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 scroll-smooth"
        style={{ minHeight: 0 }} // Important for flex scrolling
      >
        <div className="space-y-4">
          {messages.map((message) => (
            <JoshMessage
              key={message.id}
              role={message.role}
              content={message.content}
              timestamp={message.timestamp}
            />
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input - Fixed at bottom */}
      <div className="flex-shrink-0 p-4 border-t bg-background">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Josh anything..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Josh can help with emails, contacts, and tasks
        </p>
      </div>
    </div>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const getIcon = () => {
    switch (activity.activityType) {
      case "LEAD_CREATED":
      case "LEAD_CREATED_ACCULYNX":
        return <UserPlus className="w-3.5 h-3.5 text-green-500" />;
      case "EMAIL_LINKED":
        return <Link2 className="w-3.5 h-3.5 text-blue-500" />;
      case "CARRIER_EMAIL_RECEIVED":
        return <Mail className="w-3.5 h-3.5 text-orange-500" />;
      default:
        return <Mail className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex items-start gap-2 text-xs">
      <div className="mt-0.5">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{activity.title}</p>
        {activity.description && (
          <p className="text-muted-foreground truncate">{activity.description}</p>
        )}
      </div>
    </div>
  );
}

function generateWelcomeMessage(activities: Activity[]): string {
  if (activities.length === 0) {
    return "Hey! I'm Josh, your AI assistant. I monitor your emails and help manage your contacts.\n\nI haven't had any new activity to report. Is there anything I can help you with?";
  }

  const leadsCreated = activities.filter(
    (a) => a.activityType === "LEAD_CREATED" || a.activityType === "LEAD_CREATED_ACCULYNX"
  ).length;
  const emailsLinked = activities.filter(
    (a) => a.activityType === "EMAIL_LINKED"
  ).length;
  const carrierEmails = activities.filter(
    (a) => a.activityType === "CARRIER_EMAIL_RECEIVED"
  ).length;

  let message = "Hey! Here's what I've been up to:\n\n";

  if (leadsCreated > 0) {
    message += `✅ Created ${leadsCreated} new lead${leadsCreated > 1 ? "s" : ""}\n`;
  }
  if (emailsLinked > 0) {
    message += `📧 Linked ${emailsLinked} email${emailsLinked > 1 ? "s" : ""} to existing contacts\n`;
  }
  if (carrierEmails > 0) {
    message += `🏢 Received ${carrierEmails} carrier email${carrierEmails > 1 ? "s" : ""}\n`;
  }

  message += "\nNeed me to do anything else?";

  return message;
}
