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
import { TemplateSelector } from "@/components/templates/template-selector";
import { composeSMSUrl, composeEmailUrl } from "@/lib/messaging";
import { cn } from "@/lib/utils";
import {
  Zap,
  FileText,
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
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [directive, setDirective] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleOpenAction = () => {
    setDirective("");
    setShowActionPanel(true);
  };

  const handleTemplateSelect = (message: string, type: "sms" | "email", subject?: string) => {
    if (type === "sms" && contact.phone) {
      window.location.href = composeSMSUrl(contact.phone, message);
    } else if (type === "email" && contact.email) {
      window.location.href = composeEmailUrl(contact.email, subject || "", message);
    } else {
      navigator.clipboard.writeText(message);
      toast.success("Message copied to clipboard");
    }
    onActionComplete?.();
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

      toast.success("Josh is composing your message...");
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

      {/* Action Panel */}
      <Dialog open={showActionPanel} onOpenChange={setShowActionPanel}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {contact.firstName} {contact.lastName}
            </DialogTitle>
            <DialogDescription>
              Choose a template or tell Josh what to do.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Template Option */}
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-3"
              onClick={() => {
                setShowActionPanel(false);
                setShowTemplateSelector(true);
              }}
            >
              <FileText className="w-5 h-5 text-primary shrink-0" />
              <div className="text-left">
                <p className="font-medium">Use a Template</p>
                <p className="text-xs text-muted-foreground">Pick from any SMS or email template</p>
              </div>
            </Button>

            {/* Josh Directive */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <p className="text-sm font-medium">Give Josh a Directive</p>
              </div>
              <Textarea
                placeholder={'e.g. "Text the customer and ask if he had any questions about the asphalt quote I sent"'}
                value={directive}
                onChange={(e) => setDirective(e.target.value)}
                rows={3}
                className="resize-none"
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Selector (all categories) */}
      <TemplateSelector
        open={showTemplateSelector}
        onOpenChange={setShowTemplateSelector}
        category="ALL"
        context={{
          contact: {
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            phone: contact.phone,
            address: contact.address,
            carrier: contact.carrier,
            quoteType: contact.quoteType,
          },
        }}
        preferredType={contact.phone ? "sms" : "email"}
        title={`Template - ${contact.firstName} ${contact.lastName}`}
        onSelect={handleTemplateSelect}
      />
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

      toast.success("Josh is composing your message...");
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
