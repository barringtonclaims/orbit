"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TemplateSelector } from "@/components/templates/template-selector";
import { composeSMSUrl, composeEmailUrl } from "@/lib/messaging";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  MessageSquare,
  Mail,
  Calendar,
  ArrowRight,
  RefreshCw,
  FileText,
  Shield,
  ChevronDown,
  Loader2,
  Copy,
  Send,
} from "lucide-react";

type ActionButtonType =
  | "SEND_FIRST_MESSAGE"
  | "SEND_FIRST_MESSAGE_FOLLOW_UP"
  | "SCHEDULE_INSPECTION"
  | "SEND_APPOINTMENT_REMINDER"
  | "ASSIGN_STATUS"
  | "SEND_QUOTE"
  | "SEND_QUOTE_FOLLOW_UP"
  | "SEND_CLAIM_REC"
  | "SEND_CLAIM_REC_FOLLOW_UP"
  | "SEND_PA_AGREEMENT"
  | "SEND_PA_FOLLOW_UP"
  | "SEND_CLAIM_FOLLOW_UP"
  | "SEND_SEASONAL_MESSAGE"
  | "JOSH_DRAFT_MESSAGE";

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
  actionButton: ActionButtonType | string | null;
  currentAction?: ActionButtonType | string | null; // Dynamic action that may differ from actionButton
  contact: Contact;
  taskId?: string;
  taskType?: string;
  onActionComplete?: () => void; // Callback after an action is completed
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  showJoshButton?: boolean; // Show the Josh AI magic button
  className?: string;
}

// Map action buttons to their labels and icons
const ACTION_CONFIG: Record<string, { label: string; icon: typeof MessageSquare; type: "sms" | "email" | "action" }> = {
  SEND_FIRST_MESSAGE: { label: "Send Message", icon: MessageSquare, type: "sms" },
  SEND_FIRST_MESSAGE_FOLLOW_UP: { label: "Follow Up", icon: RefreshCw, type: "sms" },
  SCHEDULE_INSPECTION: { label: "Schedule", icon: Calendar, type: "action" },
  SEND_APPOINTMENT_REMINDER: { label: "Send Reminder", icon: MessageSquare, type: "sms" },
  ASSIGN_STATUS: { label: "Assign Status", icon: ArrowRight, type: "action" },
  SEND_QUOTE: { label: "Send Quote", icon: Mail, type: "email" },
  SEND_QUOTE_FOLLOW_UP: { label: "Follow Up", icon: RefreshCw, type: "sms" },
  SEND_CLAIM_REC: { label: "Send Claim Rec", icon: Shield, type: "email" },
  SEND_CLAIM_REC_FOLLOW_UP: { label: "Follow Up", icon: RefreshCw, type: "sms" },
  SEND_PA_AGREEMENT: { label: "Send PA", icon: FileText, type: "email" },
  SEND_PA_FOLLOW_UP: { label: "Follow Up", icon: RefreshCw, type: "sms" },
  SEND_CLAIM_FOLLOW_UP: { label: "Follow Up", icon: RefreshCw, type: "sms" },
  SEND_SEASONAL_MESSAGE: { label: "Seasonal Follow Up", icon: MessageSquare, type: "sms" },
  JOSH_DRAFT_MESSAGE: { label: "Josh Draft", icon: Sparkles, type: "action" },
};

// Map action buttons to template categories
const ACTION_TO_TEMPLATE_CATEGORY: Record<string, string> = {
  SEND_FIRST_MESSAGE: "FIRST_MESSAGE",
  SEND_FIRST_MESSAGE_FOLLOW_UP: "FIRST_MESSAGE_FOLLOW_UP",
  SEND_APPOINTMENT_REMINDER: "APPOINTMENT_REMINDER",
  SEND_QUOTE: "QUOTE",
  SEND_QUOTE_FOLLOW_UP: "QUOTE_FOLLOW_UP",
  SEND_CLAIM_REC: "CLAIM_RECOMMENDATION",
  SEND_CLAIM_REC_FOLLOW_UP: "CLAIM_REC_FOLLOW_UP",
  SEND_PA_AGREEMENT: "PA_AGREEMENT",
  SEND_PA_FOLLOW_UP: "PA_FOLLOW_UP",
  SEND_CLAIM_FOLLOW_UP: "CLAIM_FOLLOW_UP",
  SEND_SEASONAL_MESSAGE: "SEASONAL",
};

// Map action buttons to Josh AI message types
const ACTION_TO_JOSH_MESSAGE_TYPE: Record<string, string> = {
  SEND_FIRST_MESSAGE: "first_message",
  SEND_FIRST_MESSAGE_FOLLOW_UP: "first_message_follow_up",
  SEND_APPOINTMENT_REMINDER: "appointment_reminder",
  SEND_QUOTE_FOLLOW_UP: "quote_follow_up",
  SEND_CLAIM_REC_FOLLOW_UP: "claim_rec_follow_up",
  SEND_PA_FOLLOW_UP: "pa_follow_up",
  SEND_CLAIM_FOLLOW_UP: "claim_follow_up",
  SEND_SEASONAL_MESSAGE: "seasonal_follow_up",
};

export function TaskActionButton({
  actionButton,
  currentAction,
  contact,
  taskId,
  taskType,
  onActionComplete,
  variant = "outline",
  size = "sm",
  showJoshButton = true,
  className,
}: TaskActionButtonProps) {
  const router = useRouter();
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showJoshDraft, setShowJoshDraft] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [draftType, setDraftType] = useState<"sms" | "email">("sms");

  // Use currentAction if provided, otherwise fall back to actionButton
  const activeAction = (currentAction || actionButton) as ActionButtonType;
  
  if (!activeAction) return null;

  const config = ACTION_CONFIG[activeAction];
  if (!config) return null;

  const handlePrimaryAction = () => {
    switch (activeAction) {
      case "SCHEDULE_INSPECTION":
        router.push(`/contacts/${contact.id}?action=schedule`);
        break;
      case "ASSIGN_STATUS":
        router.push(`/contacts/${contact.id}?action=assign`);
        break;
      case "JOSH_DRAFT_MESSAGE":
        handleJoshDraft();
        break;
      default:
        // For messaging actions, open template selector
        setShowTemplateSelector(true);
    }
  };

  const handleJoshDraft = async () => {
    setIsGenerating(true);
    setShowJoshDraft(true);
    setDraftMessage("");

    try {
      const messageType = ACTION_TO_JOSH_MESSAGE_TYPE[activeAction] || "general_follow_up";
      const response = await fetch("/api/josh/draft-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          messageType,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate message");
      }

      const data = await response.json();
      setDraftMessage(data.message);
      
      // Determine if this should be SMS or email
      const configType = config?.type;
      setDraftType(configType === "email" ? "email" : "sms");
    } catch (error) {
      console.error("Error generating Josh draft:", error);
      toast.error("Failed to generate message");
      setShowJoshDraft(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendDraft = () => {
    if (draftType === "sms" && contact.phone) {
      window.location.href = composeSMSUrl(contact.phone, draftMessage);
    } else if (draftType === "email" && contact.email) {
      window.location.href = composeEmailUrl(contact.email, "", draftMessage);
    } else {
      navigator.clipboard.writeText(draftMessage);
      toast.success("Message copied to clipboard");
    }
    setShowJoshDraft(false);
    onActionComplete?.();
  };

  const handleCopyDraft = () => {
    navigator.clipboard.writeText(draftMessage);
    toast.success("Copied to clipboard");
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

  const templateCategory = ACTION_TO_TEMPLATE_CATEGORY[activeAction] || "GENERAL";
  const Icon = config.icon;

  // Determine if button should be disabled
  const isMessageAction = config.type === "sms" || config.type === "email";
  const hasContactMethod = config.type === "sms" ? contact.phone : contact.email;
  const isDisabled = isMessageAction && !hasContactMethod;

  return (
    <>
      {/* Main Action Button with optional Josh AI dropdown */}
      {showJoshButton && isMessageAction ? (
        <div className={cn("flex", className)}>
          <Button
            variant={variant}
            size={size}
            onClick={handlePrimaryAction}
            disabled={isDisabled}
            className="rounded-r-none border-r-0"
          >
            <Icon className="w-4 h-4 mr-2" />
            {config.label}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={variant}
                size={size}
                className="rounded-l-none px-2"
                disabled={isDisabled}
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handlePrimaryAction}>
                <Icon className="w-4 h-4 mr-2" />
                Use Template
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleJoshDraft}>
                <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
                Josh AI Draft
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <Button
          variant={variant}
          size={size}
          onClick={handlePrimaryAction}
          disabled={isDisabled}
          className={cn("gap-2", className)}
        >
          <Icon className="w-4 h-4" />
          {config.label}
        </Button>
      )}

      {/* Template Selector */}
      <TemplateSelector
        open={showTemplateSelector}
        onOpenChange={setShowTemplateSelector}
        category={templateCategory}
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
        preferredType={config.type === "email" ? "email" : "sms"}
        title={`${config.label} - ${contact.firstName} ${contact.lastName}`}
        onSelect={handleTemplateSelect}
      />

      {/* Josh AI Draft Dialog */}
      <Dialog open={showJoshDraft} onOpenChange={setShowJoshDraft}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Josh AI Draft
            </DialogTitle>
            <DialogDescription>
              AI-generated message for {contact.firstName} {contact.lastName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isGenerating ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">Josh is writing...</span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Generated Message ({draftType.toUpperCase()})</Label>
                  <Textarea
                    value={draftMessage}
                    onChange={(e) => setDraftMessage(e.target.value)}
                    rows={6}
                    className="resize-none"
                    placeholder="Josh's message will appear here..."
                  />
                </div>

                <div className="flex gap-2 text-sm text-muted-foreground">
                  <span>Sending to:</span>
                  <span className="font-medium">
                    {draftType === "sms" ? contact.phone || "No phone" : contact.email || "No email"}
                  </span>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCopyDraft} disabled={isGenerating || !draftMessage}>
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </Button>
            <Button onClick={handleJoshDraft} variant="ghost" disabled={isGenerating}>
              <RefreshCw className={cn("w-4 h-4 mr-2", isGenerating && "animate-spin")} />
              Regenerate
            </Button>
            <Button onClick={handleSendDraft} disabled={isGenerating || !draftMessage}>
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </DialogFooter>
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
  messageType = "general_follow_up",
  variant = "ghost",
  size = "sm",
  className,
}: {
  contact: Contact;
  messageType?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}) {
  const [showJoshDraft, setShowJoshDraft] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [draftType, setDraftType] = useState<"sms" | "email">("sms");

  const handleClick = async () => {
    setIsGenerating(true);
    setShowJoshDraft(true);
    setDraftMessage("");

    try {
      const response = await fetch("/api/josh/draft-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          messageType,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate message");
      }

      const data = await response.json();
      setDraftMessage(data.message);
      setDraftType(contact.phone ? "sms" : "email");
    } catch (error) {
      console.error("Error generating Josh draft:", error);
      toast.error("Failed to generate message");
      setShowJoshDraft(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendDraft = () => {
    if (draftType === "sms" && contact.phone) {
      window.location.href = composeSMSUrl(contact.phone, draftMessage);
    } else if (draftType === "email" && contact.email) {
      window.location.href = composeEmailUrl(contact.email, "", draftMessage);
    } else {
      navigator.clipboard.writeText(draftMessage);
      toast.success("Message copied to clipboard");
    }
    setShowJoshDraft(false);
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        className={cn("gap-2", className)}
      >
        <Sparkles className="w-4 h-4 text-amber-500" />
        <span className="hidden sm:inline">Ask Josh</span>
      </Button>

      <Dialog open={showJoshDraft} onOpenChange={setShowJoshDraft}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Josh AI Draft
            </DialogTitle>
            <DialogDescription>
              AI-generated message for {contact.firstName} {contact.lastName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isGenerating ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">Josh is writing...</span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Generated Message ({draftType.toUpperCase()})</Label>
                  <Textarea
                    value={draftMessage}
                    onChange={(e) => setDraftMessage(e.target.value)}
                    rows={6}
                    className="resize-none"
                    placeholder="Josh's message will appear here..."
                  />
                </div>

                <div className="flex gap-2 text-sm text-muted-foreground">
                  <span>Sending to:</span>
                  <span className="font-medium">
                    {draftType === "sms" ? contact.phone || "No phone" : contact.email || "No email"}
                  </span>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(draftMessage)} disabled={isGenerating || !draftMessage}>
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </Button>
            <Button onClick={handleClick} variant="ghost" disabled={isGenerating}>
              <RefreshCw className={cn("w-4 h-4 mr-2", isGenerating && "animate-spin")} />
              Regenerate
            </Button>
            <Button onClick={handleSendDraft} disabled={isGenerating || !draftMessage}>
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

