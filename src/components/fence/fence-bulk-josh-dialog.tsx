"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Zap, Send, Eraser } from "lucide-react";
import type { FenceContactResult } from "@/lib/actions/fences";

interface FenceBulkJoshDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: FenceContactResult[];
  onComplete?: () => void;
}

export function FenceBulkJoshDialog({
  open,
  onOpenChange,
  contacts,
  onComplete,
}: FenceBulkJoshDialogProps) {
  const [directives, setDirectives] = useState<Record<string, string>>({});

  const filledCount = contacts.filter(
    (c) => directives[c.id]?.trim()
  ).length;

  const updateDirective = (contactId: string, value: string) => {
    setDirectives((prev) => ({ ...prev, [contactId]: value }));
  };

  const handleClearAll = () => {
    setDirectives({});
  };

  const handleQueueAll = async () => {
    const items = contacts
      .filter((c) => directives[c.id]?.trim())
      .map((c) => ({
        contactId: c.id,
        directive: directives[c.id].trim(),
      }));

    if (items.length === 0) {
      toast.error("Enter at least one directive");
      return;
    }

    try {
      const res = await fetch("/api/josh/queue-directive-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directives: items }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to queue directives");
      }

      const data = await res.json();
      toast.success(
        `${data.queued} directive${data.queued !== 1 ? "s" : ""} queued — Josh is composing in the background`
      );

      // Fire-and-forget: kick off background compose
      fetch("/api/josh/process-queue", { method: "POST" }).catch(() => {});

      setDirectives({});
      onOpenChange(false);
      onComplete?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to queue directives"
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex !flex-col max-w-2xl max-h-[85vh] overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Bulk Directives — {contacts.length} Contact
            {contacts.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Type a directive for each contact. Josh will compose messages in the
            background and queue them in your outbox.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          <div className="space-y-3 py-2">
            {contacts.map((contact) => (
              <div key={contact.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {contact.firstName} {contact.lastName}
                  </span>
                  {contact.stage && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 px-1.5"
                      style={{
                        borderColor: contact.stage.color,
                        color: contact.stage.color,
                      }}
                    >
                      {contact.stage.name}
                    </Badge>
                  )}
                </div>
                <Textarea
                  placeholder={`Tell Josh what to do for ${contact.firstName}...`}
                  value={directives[contact.id] || ""}
                  onChange={(e) => updateDirective(contact.id, e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 sm:justify-between border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            disabled={filledCount === 0}
            className="gap-1.5"
          >
            <Eraser className="w-4 h-4" />
            Clear All
          </Button>

          <Button
            onClick={handleQueueAll}
            disabled={filledCount === 0}
            className="gap-2"
          >
            <Send className="w-4 h-4" />
            Queue {filledCount} Directive{filledCount !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
