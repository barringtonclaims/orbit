"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Zap,
  Sparkles,
  Loader2,
  Send,
} from "lucide-react";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  carrier: string | null;
  quoteType: string | null;
}

interface TaskActionButtonProps {
  actionButton?: string | null;
  currentAction?: string | null;
  contact: Contact;
  taskId?: string;
  taskType?: string;
  onActionComplete?: () => void;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  showJoshButton?: boolean;
  className?: string;
}

export function TaskActionButton({
  contact,
  taskId,
  taskType,
  onActionComplete,
  variant = "outline",
  size = "sm",
  className,
}: TaskActionButtonProps) {
  const [showActionPanel, setShowActionPanel] = useState(false);
  const [directive, setDirective] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleOpenAction = () => {
    setDirective("");
    setShowActionPanel(true);
  };

  const handleSendDirective = async () => {
    if (!directive.trim()) {
      toast.error("Please enter a directive for Josh");
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch("/api/josh/queue-directive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          taskId: taskId || null,
          directive: directive.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to queue directive");
      }

      toast.success("Directive queued — Josh is composing in the background");

      fetch("/api/josh/process-queue", { method: "POST" }).catch(() => {});

      setShowActionPanel(false);
      setDirective("");
      onActionComplete?.();
    } catch {
      toast.error("Failed to send directive to Josh");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleOpenAction}
        className={cn("gap-1.5", className)}
      >
        <Zap className="w-4 h-4" />
        <span className="hidden sm:inline">Action</span>
      </Button>

      <Dialog open={showActionPanel} onOpenChange={setShowActionPanel}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              {contact.firstName} {contact.lastName}
            </DialogTitle>
            <DialogDescription>
              Tell Josh what to do for this contact.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              placeholder={'e.g. "Text the customer and follow up on the quote" or "Set status to retail prospect and schedule a follow up for Tuesday"'}
              value={directive}
              onChange={(e) => setDirective(e.target.value)}
              rows={3}
              className="resize-none"
              autoFocus
            />
            <Button
              onClick={handleSendDirective}
              disabled={isSending || !directive.trim()}
              className="w-full gap-2"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {isSending ? "Sending to Josh..." : "Send to Josh"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Standalone Josh AI button - for use outside of action context
 */
export function JoshAIButton({
  contact,
  taskId,
  variant = "ghost",
  size = "sm",
  className,
}: {
  contact: Contact;
  taskId?: string;
  messageType?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}) {
  const [showDirective, setShowDirective] = useState(false);
  const [directive, setDirective] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSendDirective = async () => {
    if (!directive.trim()) {
      toast.error("Please enter a directive for Josh");
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch("/api/josh/queue-directive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          taskId: taskId || null,
          directive: directive.trim(),
        }),
      });

      if (!res.ok) throw new Error("Failed");

      toast.success("Directive queued — Josh is composing in the background");

      fetch("/api/josh/process-queue", { method: "POST" }).catch(() => {});

      setShowDirective(false);
      setDirective("");
    } catch {
      toast.error("Failed to send directive to Josh");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => { setDirective(""); setShowDirective(true); }}
        className={cn("gap-2", className)}
      >
        <Sparkles className="w-4 h-4 text-amber-500" />
        <span className="hidden sm:inline">Ask Josh</span>
      </Button>

      <Dialog open={showDirective} onOpenChange={setShowDirective}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Josh AI
            </DialogTitle>
            <DialogDescription>
              Tell Josh what to draft for {contact.firstName} {contact.lastName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              placeholder={'e.g. "Send a follow-up about the inspection we did last week"'}
              value={directive}
              onChange={(e) => setDirective(e.target.value)}
              rows={3}
              className="resize-none"
              autoFocus
            />
            <Button
              onClick={handleSendDirective}
              disabled={isSending || !directive.trim()}
              className="w-full gap-2"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {isSending ? "Sending to Josh..." : "Send to Josh"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
