"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Zap,
  Send,
  Loader2,
  Eraser,
  AlertTriangle,
} from "lucide-react";

const MAX_BULK = 20;

interface Task {
  id: string;
  title: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    stage: {
      name: string;
      color: string;
    } | null;
  };
}

interface BulkJoshDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  onComplete?: () => void;
}

export function BulkJoshDialog({
  open,
  onOpenChange,
  tasks,
  onComplete,
}: BulkJoshDialogProps) {
  const [directives, setDirectives] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);

  const displayTasks = tasks.slice(0, MAX_BULK);
  const overLimit = tasks.length > MAX_BULK;

  const filledCount = displayTasks.filter(
    (t) => directives[t.id]?.trim()
  ).length;

  const updateDirective = (taskId: string, value: string) => {
    setDirectives((prev) => ({ ...prev, [taskId]: value }));
  };

  const handleClearAll = () => {
    setDirectives({});
  };

  const handleSendAll = async () => {
    const items = displayTasks
      .filter((t) => directives[t.id]?.trim())
      .map((t) => ({
        contactId: t.contact.id,
        taskId: t.id,
        directive: directives[t.id].trim(),
      }));

    if (items.length === 0) {
      toast.error("Enter at least one directive");
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch("/api/josh/queue-directive-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directives: items }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Batch request failed");
      }

      const data = await res.json();
      const { summary } = data;

      if (summary.failed > 0) {
        toast.warning(
          `${summary.succeeded} sent to Josh, ${summary.failed} failed`
        );
      } else {
        toast.success(
          `${summary.succeeded} directive${summary.succeeded !== 1 ? "s" : ""} sent to Josh — ${summary.draftsCreated} draft${summary.draftsCreated !== 1 ? "s" : ""} queued`
        );
      }

      setDirectives({});
      onOpenChange(false);
      onComplete?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send directives"
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Bulk Directives — {displayTasks.length} Task{displayTasks.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Type a directive for each task. Josh will compose messages for all of
            them and queue them in your outbox.
          </DialogDescription>
        </DialogHeader>

        {overLimit && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Only the first {MAX_BULK} of {tasks.length} selected tasks are shown.
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-3 py-2">
            {displayTasks.map((task) => (
              <div
                key={task.id}
                className="border rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {task.contact.firstName} {task.contact.lastName}
                  </span>
                  {task.contact.stage && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 px-1.5"
                      style={{
                        borderColor: task.contact.stage.color,
                        color: task.contact.stage.color,
                      }}
                    >
                      {task.contact.stage.name}
                    </Badge>
                  )}
                </div>
                <Textarea
                  placeholder={`Tell Josh what to do for ${task.contact.firstName}...`}
                  value={directives[task.id] || ""}
                  onChange={(e) => updateDirective(task.id, e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                  disabled={isSending}
                />
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            disabled={isSending || filledCount === 0}
            className="gap-1.5"
          >
            <Eraser className="w-4 h-4" />
            Clear All
          </Button>

          <Button
            onClick={handleSendAll}
            disabled={isSending || filledCount === 0}
            className="gap-2"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {isSending
              ? `Sending ${filledCount} to Josh...`
              : `Send ${filledCount} Directive${filledCount !== 1 ? "s" : ""} to Josh`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
