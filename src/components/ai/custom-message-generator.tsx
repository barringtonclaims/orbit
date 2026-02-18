"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { generateMessage, type MessageContext } from "@/lib/ai/gemini";
import { Sparkles, Loader2, Copy, Send, MessageSquare, Mail, RefreshCw } from "lucide-react";

interface CustomMessageGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: string;
  contact: {
    firstName: string;
    lastName?: string;
    address?: string | null;
    city?: string | null;
    carrier?: string | null;
    dateOfLoss?: Date | null;
    quoteType?: string | null;
  };
  userName?: string;
  onSelect: (message: string, type: "sms" | "email", subject?: string) => void;
}

export function CustomMessageGenerator({
  open,
  onOpenChange,
  category,
  contact,
  userName,
  onSelect,
}: CustomMessageGeneratorProps) {
  const [messageType, setMessageType] = useState<"sms" | "email">("sms");
  const [description, setDescription] = useState("");
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [generatedSubject, setGeneratedSubject] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const handleGenerate = async () => {
    if (!description.trim()) {
      toast.error("Please describe what you want to say");
      return;
    }

    setIsGenerating(true);
    setGeneratedMessage("");
    setGeneratedSubject("");

    try {
      const context: MessageContext = {
        messageType,
        category,
        contact: {
          firstName: contact.firstName,
          lastName: contact.lastName,
          address: contact.address,
          city: contact.city,
          carrier: contact.carrier,
          dateOfLoss: contact.dateOfLoss?.toLocaleDateString(),
          quoteType: contact.quoteType,
        },
        userDescription: description,
        userName,
      };

      const result = await generateMessage(context);

      if (result.error || !result.data) {
        toast.error(result.error || "Failed to generate message");
        return;
      }

      setGeneratedMessage(result.data.message);
      if (result.data.subject) {
        setGeneratedSubject(result.data.subject);
      }
    } catch {
      toast.error("Failed to generate message");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedMessage);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleSend = () => {
    if (!generatedMessage.trim()) {
      toast.error("No message to send");
      return;
    }
    
    onSelect(
      generatedMessage,
      messageType,
      messageType === "email" ? generatedSubject : undefined
    );
    onOpenChange(false);
  };

  const handleReset = () => {
    setGeneratedMessage("");
    setGeneratedSubject("");
    setIsEditing(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            AI Message Generator
          </DialogTitle>
          <DialogDescription>
            Describe what you want to say and AI will help write it
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden">
          {/* Message Type Selector */}
          <Tabs value={messageType} onValueChange={(v) => setMessageType(v as "sms" | "email")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sms" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                SMS
              </TabsTrigger>
              <TabsTrigger value="email" className="gap-2">
                <Mail className="h-4 w-4" />
                Email
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Description Input */}
          <div className="space-y-2">
            <Label>What do you want to say?</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                messageType === "sms"
                  ? "e.g., Follow up on the quote, ask if they have any questions, mention we can start next week..."
                  : "e.g., Send a detailed follow-up about their insurance claim, include the carrier info and next steps..."
              }
              rows={3}
              disabled={isGenerating}
            />
          </div>

          {/* Generate Button */}
          {!generatedMessage && (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !description.trim()}
              className="w-full gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Message
                </>
              )}
            </Button>
          )}

          {/* Generated Message */}
          {generatedMessage && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Generated Message</Label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                    className="h-7"
                  >
                    {isEditing ? "Preview" : "Edit"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="h-7 gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Regenerate
                  </Button>
                </div>
              </div>

              {/* Subject (for email) */}
              {messageType === "email" && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Subject</Label>
                  {isEditing ? (
                    <Input
                      value={generatedSubject}
                      onChange={(e) => setGeneratedSubject(e.target.value)}
                    />
                  ) : (
                    <p className="text-sm p-2 bg-muted rounded-md">
                      {generatedSubject || "(No subject)"}
                    </p>
                  )}
                </div>
              )}

              {/* Message Body */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Message</Label>
                {isEditing ? (
                  <Textarea
                    value={generatedMessage}
                    onChange={(e) => setGeneratedMessage(e.target.value)}
                    rows={messageType === "email" ? 8 : 4}
                    className="resize-none"
                  />
                ) : (
                  <ScrollArea className="h-[200px] border rounded-md">
                    <div className="p-3 text-sm whitespace-pre-wrap">
                      {generatedMessage}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {generatedMessage && (
            <>
              <Button
                variant="outline"
                onClick={handleCopy}
                className="gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
              <Button onClick={handleSend} className="gap-2">
                <Send className="h-4 w-4" />
                {messageType === "sms" ? "Open SMS" : "Open Email"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


