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
import { cn } from "@/lib/utils";
import {
  Zap,
  Send,
  Eraser,
  CopyPlus,
  Loader2,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
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
  const [batchPrompt, setBatchPrompt] = useState("");
  const [showPerContact, setShowPerContact] = useState(false);
  const [isQueuing, setIsQueuing] = useState(false);

  const filledCount = contacts.filter(
    (c) => directives[c.id]?.trim()
  ).length;

  const effectiveCount = batchPrompt.trim()
    ? contacts.length
    : filledCount;

  const updateDirective = (contactId: string, value: string) => {
    setDirectives((prev) => ({ ...prev, [contactId]: value }));
  };

  const handleApplyBatchToAll = () => {
    if (!batchPrompt.trim()) return;
    const updated: Record<string, string> = {};
    contacts.forEach((c) => {
      updated[c.id] = batchPrompt.trim();
    });
    setDirectives(updated);
    toast.success(`Applied to all ${contacts.length} contacts`);
  };

  const handleClearAll = () => {
    setDirectives({});
    setBatchPrompt("");
  };

  const handleQueueAll = async () => {
    const prompt = batchPrompt.trim();

    const items = contacts
      .filter((c) => prompt || directives[c.id]?.trim())
      .map((c) => ({
        contactId: c.id,
        directive: directives[c.id]?.trim() || prompt,
      }));

    if (items.length === 0) {
      toast.error("Enter at least one directive");
      return;
    }

    setIsQueuing(true);
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

      fetch("/api/josh/process-queue", { method: "POST" }).catch(() => {});

      setDirectives({});
      setBatchPrompt("");
      setShowPerContact(false);
      onOpenChange(false);
      onComplete?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to queue directives"
      );
    } finally {
      setIsQueuing(false);
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
            Write one prompt for all selected contacts, or expand to customize per contact.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          <div className="space-y-4 py-2">
            {/* Batch prompt */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CopyPlus className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium">
                  Prompt for All ({contacts.length})
                </span>
              </div>
              <Textarea
                placeholder={`e.g. "Follow up and see if they have any questions" — applies to all ${contacts.length} selected contacts`}
                value={batchPrompt}
                onChange={(e) => setBatchPrompt(e.target.value)}
                rows={3}
                className="resize-none text-sm"
              />
              {batchPrompt.trim() && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={handleApplyBatchToAll}
                  >
                    <CopyPlus className="w-3 h-3" />
                    Copy to all & customize
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    or just queue — batch prompt applies automatically
                  </span>
                </div>
              )}
            </div>

            {/* Per-contact toggle */}
            <button
              type="button"
              onClick={() => setShowPerContact(!showPerContact)}
              className={cn(
                "flex items-center gap-2 text-sm w-full py-2 px-3 rounded-md border transition-colors",
                showPerContact
                  ? "bg-muted border-border"
                  : "bg-transparent border-dashed border-muted-foreground/30 hover:border-muted-foreground/50"
              )}
            >
              {showPerContact ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              <span className="font-medium">Per-contact overrides</span>
              {filledCount > 0 && (
                <Badge variant="secondary" className="text-xs ml-auto">
                  {filledCount} customized
                </Badge>
              )}
            </button>

            {showPerContact && (
              <div className="space-y-3">
                {contacts.map((contact) => {
                  const hasOverride = !!directives[contact.id]?.trim();
                  const usingBatch = !hasOverride && !!batchPrompt.trim();
                  return (
                    <div
                      key={contact.id}
                      className={cn(
                        "border rounded-lg p-3 space-y-2 transition-colors",
                        usingBatch && "border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10"
                      )}
                    >
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
                        {usingBatch && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 ml-auto text-amber-600 border-amber-400">
                            <Check className="w-2.5 h-2.5 mr-0.5" />
                            Batch
                          </Badge>
                        )}
                      </div>
                      <Textarea
                        placeholder={
                          batchPrompt.trim()
                            ? `Using batch prompt — type here to override for ${contact.firstName}`
                            : `Tell Josh what to do for ${contact.firstName}...`
                        }
                        value={directives[contact.id] || ""}
                        onChange={(e) => updateDirective(contact.id, e.target.value)}
                        rows={2}
                        className={cn(
                          "resize-none text-sm",
                          usingBatch && "placeholder:text-amber-600/60"
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 sm:justify-between border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            disabled={filledCount === 0 && !batchPrompt.trim()}
            className="gap-1.5"
          >
            <Eraser className="w-4 h-4" />
            Clear All
          </Button>

          <Button
            onClick={handleQueueAll}
            disabled={effectiveCount === 0 || isQueuing}
            className="gap-2"
          >
            {isQueuing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {isQueuing
              ? "Queuing..."
              : `Queue ${effectiveCount} Directive${effectiveCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
