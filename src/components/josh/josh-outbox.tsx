"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { toast } from "sonner";
import { composeSMSUrl, composeEmailUrl } from "@/lib/messaging";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Inbox,
  MessageSquare,
  Mail,
  Send,
  X,
  Edit2,
  Check,
  User,
  Building2,
  Loader2,
  Zap,
  ArrowRight,
  StickyNote,
  CalendarDays,
  Contact,
  Phone,
} from "lucide-react";

interface Draft {
  id: string;
  channel: string;
  recipientType: string;
  subject: string | null;
  body: string;
  directive: string;
  status: string;
  draftType: string;
  actionPayload: Record<string, unknown> | null;
  taskId: string | null;
  createdAt: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    carrier: string | null;
    carrierId: string | null;
    claimNumber: string | null;
    policyNumber: string | null;
    adjusterEmail: string | null;
    stage?: { id: string; name: string } | null;
    carrierRef: {
      id: string;
      name: string;
      unifiedEmail: string | null;
      emailType: string;
      requiresClaimInSubject: boolean;
      subjectFormat: string | null;
    } | null;
  };
}

export function JoshOutbox() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dateOverrides, setDateOverrides] = useState<Record<string, Date | undefined>>({});
  const processingRef = useRef(false);

  const hasComposing = drafts.some(
    (d) => d.status === "queued" || d.status === "composing"
  );
  const pendingDrafts = drafts.filter((d) => d.status === "pending");
  const composingDrafts = drafts.filter(
    (d) => d.status === "queued" || d.status === "composing"
  );
  const totalCount = drafts.length;

  const triggerProcessQueue = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;
    fetch("/api/josh/process-queue", { method: "POST" })
      .catch(() => {})
      .finally(() => {
        processingRef.current = false;
      });
  }, []);

  const fetchDrafts = useCallback(async () => {
    try {
      const res = await fetch("/api/josh/drafts");
      if (res.ok) {
        const data = await res.json();
        const fetched: Draft[] = data.drafts || [];
        setDrafts(fetched);

        const hasQueued = fetched.some((d) => d.status === "queued");
        if (hasQueued) {
          triggerProcessQueue();
        }
      }
    } catch {
      // Silent fail on background poll
    }
  }, [triggerProcessQueue]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  useEffect(() => {
    if (hasComposing) {
      const interval = setInterval(fetchDrafts, 2000);
      return () => clearInterval(interval);
    }
    if (isOpen) {
      const interval = setInterval(fetchDrafts, 5000);
      return () => clearInterval(interval);
    }
    const interval = setInterval(fetchDrafts, 15000);
    return () => clearInterval(interval);
  }, [isOpen, hasComposing, fetchDrafts]);

  const handleEdit = (draft: Draft) => {
    setEditingId(draft.id);
    setEditBody(draft.body);
    setEditSubject(draft.subject || "");
  };

  const handleSaveEdit = async (draftId: string, draftType?: string) => {
    try {
      const updates: Record<string, unknown> = { id: draftId };

      if (draftType === "add_note") {
        updates.body = editBody;
        updates.actionPayload = { content: editBody };
      } else {
        updates.body = editBody;
        updates.subject = editSubject || null;
      }

      await fetch("/api/josh/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      setEditingId(null);
      fetchDrafts();
    } catch {
      toast.error("Failed to save edit");
    }
  };

  const resolveCarrierSubject = (draft: Draft): string => {
    return draft.contact.claimNumber || draft.subject || "";
  };

  const handleSend = async (draft: Draft) => {
    setSendingId(draft.id);
    try {
      if (draft.draftType === "contact_resource") {
        const payload = draft.actionPayload as { resourceCompanyName?: string; resourceContactName?: string } | null;
        const res = await fetch(`/api/josh/resource-lookup?company=${encodeURIComponent(payload?.resourceCompanyName || "")}&contact=${encodeURIComponent(payload?.resourceContactName || "")}`);
        const data = res.ok ? await res.json() : null;
        const rcPhone = data?.phone;
        const rcEmail = data?.email;

        if (draft.channel === "sms") {
          if (!rcPhone) {
            const fallback = window.prompt(`Enter phone number for ${payload?.resourceContactName}:`);
            if (!fallback) { toast.error("Phone number is required"); return; }
            window.location.href = composeSMSUrl(fallback, draft.body);
          } else {
            window.location.href = composeSMSUrl(rcPhone, draft.body);
          }
        } else {
          if (!rcEmail) {
            const fallback = window.prompt(`Enter email for ${payload?.resourceContactName}:`);
            if (!fallback) { toast.error("Email is required"); return; }
            window.location.href = composeEmailUrl(fallback, draft.subject || "", draft.body);
          } else {
            window.location.href = composeEmailUrl(rcEmail, draft.subject || "", draft.body);
          }
        }

        await fetch(`/api/josh/drafts/${draft.id}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        toast.success(`${draft.channel === "sms" ? "Text" : "Email"} sent to ${payload?.resourceContactName || "resource"}`);
        fetchDrafts();
        return;
      }

      if (draft.channel === "sms") {
        if (!draft.contact.phone) {
          toast.error("No phone number on file");
          return;
        }
        window.location.href = composeSMSUrl(draft.contact.phone, draft.body);
      } else if (draft.channel === "email") {
        let recipientEmail: string | null = null;
        let subject = draft.subject || "";

        if (draft.recipientType === "carrier") {
          const ref = draft.contact.carrierRef;
          if (ref?.emailType === "UNIFIED" && ref.unifiedEmail) {
            recipientEmail = ref.unifiedEmail;
          } else if (ref?.emailType === "PER_ADJUSTER" && draft.contact.adjusterEmail) {
            recipientEmail = draft.contact.adjusterEmail;
          } else if (ref?.emailType === "PER_ADJUSTER" && !draft.contact.adjusterEmail) {
            const email = window.prompt(
              `Enter adjuster email for ${ref.name}:`,
              ""
            );
            if (!email) {
              toast.error("Adjuster email is required for this carrier");
              return;
            }
            recipientEmail = email;
          }

          if (!recipientEmail) {
            toast.error("No carrier email configured. Please add claim info first.");
            return;
          }

          subject = resolveCarrierSubject(draft);
        } else {
          recipientEmail = draft.contact.email;
        }

        if (!recipientEmail) {
          toast.error("No email address on file");
          return;
        }

        const emailOptions: { cc?: string } = {};
        if (draft.recipientType === "carrier" && draft.contact.email) {
          emailOptions.cc = draft.contact.email;
        }
        window.location.href = composeEmailUrl(recipientEmail, subject, draft.body, emailOptions);
      }

      await fetch(`/api/josh/drafts/${draft.id}/send`, { method: "POST" });
      toast.success(`${draft.channel === "sms" ? "Text" : "Email"} sent to ${draft.contact.firstName}`);
      fetchDrafts();
    } catch {
      toast.error("Failed to mark as sent");
    } finally {
      setSendingId(null);
    }
  };

  const handleExecute = async (draft: Draft) => {
    setSendingId(draft.id);
    try {
      const overrideDate = dateOverrides[draft.id];
      let overridePayload: Record<string, unknown> | undefined;

      if (overrideDate) {
        overridePayload = { ...(draft.actionPayload || {}) };
        if (draft.draftType === "set_date") {
          overridePayload.date = overrideDate.toISOString().split("T")[0];
        } else if (draft.draftType === "progress_task") {
          overridePayload.dueDate = overrideDate.toISOString().split("T")[0];
        }
      }

      const res = await fetch(`/api/josh/drafts/${draft.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionPayload: overridePayload,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to execute action");
        return;
      }

      const labels: Record<string, string> = {
        progress_task: "Status updated",
        add_note: "Note added",
        set_date: "Date set",
        schedule_appointment: "Appointment scheduled",
        contact_resource: "Resource contacted",
      };
      toast.success(`${labels[draft.draftType] || "Action completed"} for ${draft.contact.firstName}`);
      setDateOverrides((prev) => {
        const next = { ...prev };
        delete next[draft.id];
        return next;
      });
      fetchDrafts();
    } catch {
      toast.error("Failed to execute action");
    } finally {
      setSendingId(null);
    }
  };

  const handleDiscard = async (draftId: string) => {
    try {
      await fetch("/api/josh/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draftId, status: "discarded" }),
      });
      fetchDrafts();
    } catch {
      toast.error("Failed to discard");
    }
  };

  const getDraftTypeIcon = (draftType: string) => {
    switch (draftType) {
      case "progress_task":
        return <ArrowRight className="w-3 h-3" />;
      case "add_note":
        return <StickyNote className="w-3 h-3" />;
      case "set_date":
        return <CalendarDays className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const getDraftTypeLabel = (draftType: string) => {
    switch (draftType) {
      case "progress_task":
        return "Progress Task";
      case "add_note":
        return "Add Note";
      case "set_date":
        return "Set Date";
      default:
        return null;
    }
  };

  const getDraftTypeBadgeClass = (draftType: string) => {
    switch (draftType) {
      case "progress_task":
        return "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300";
      case "add_note":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
      case "set_date":
        return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
      case "schedule_appointment":
        return "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300";
      case "contact_resource":
        return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300";
      default:
        return "";
    }
  };

  const renderMessageCard = (draft: Draft) => (
    <div key={draft.id} className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">
            {draft.contact.firstName} {draft.contact.lastName}
          </span>
          <Badge variant="outline" className="text-xs gap-1 py-0">
            {draft.channel === "sms" ? (
              <><MessageSquare className="w-3 h-3" /> Text</>
            ) : (
              <><Mail className="w-3 h-3" /> Email</>
            )}
          </Badge>
        </div>
        <Badge
          variant="secondary"
          className={cn(
            "text-xs gap-1",
            draft.recipientType === "carrier" && "bg-blue-100 text-blue-700"
          )}
        >
          {draft.recipientType === "carrier" ? (
            <><Building2 className="w-3 h-3" /> Carrier</>
          ) : (
            <><User className="w-3 h-3" /> Customer</>
          )}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground italic">
        &ldquo;{draft.directive}&rdquo;
      </p>

      {draft.channel !== "sms" && editingId === draft.id && (
        <input
          className="w-full text-sm border rounded px-2 py-1"
          value={editSubject}
          onChange={(e) => setEditSubject(e.target.value)}
          placeholder="Subject..."
        />
      )}
      {draft.channel !== "sms" && editingId !== draft.id && draft.subject && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Subject:</span> {draft.subject}
        </p>
      )}

      {editingId === draft.id ? (
        <Textarea
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          rows={4}
          className="text-sm resize-none"
        />
      ) : (
        <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3">
          {draft.body}
        </p>
      )}

      <div className="flex items-center gap-2">
        {editingId === draft.id ? (
          <>
            <Button size="sm" onClick={() => handleSaveEdit(draft.id)} className="gap-1">
              <Check className="w-3 h-3" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              onClick={() => handleSend(draft)}
              disabled={sendingId === draft.id}
              className="gap-1"
            >
              {sendingId === draft.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              Send
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleEdit(draft)} className="gap-1">
              <Edit2 className="w-3 h-3" /> Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive gap-1 ml-auto"
              onClick={() => handleDiscard(draft.id)}
            >
              <X className="w-3 h-3" /> Discard
            </Button>
          </>
        )}
      </div>
    </div>
  );

  const renderProgressCard = (draft: Draft) => {
    const payload = draft.actionPayload as {
      stageName?: string;
      stageId?: string;
      nextTaskType?: string;
      customTaskName?: string;
      dueDate?: string;
    } | null;

    const currentStage = draft.contact.stage?.name || "Unknown";
    const targetStage = payload?.stageName || "Unknown";
    const suggestedDate = payload?.dueDate ? new Date(payload.dueDate + "T12:00:00") : undefined;
    const overrideDate = dateOverrides[draft.id];
    const displayDate = overrideDate || suggestedDate;

    return (
      <div key={draft.id} className="border rounded-lg p-4 space-y-3 border-purple-200 dark:border-purple-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {draft.contact.firstName} {draft.contact.lastName}
            </span>
            <Badge variant="secondary" className={cn("text-xs gap-1 py-0", getDraftTypeBadgeClass("progress_task"))}>
              <ArrowRight className="w-3 h-3" /> Progress
            </Badge>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">
          &ldquo;{draft.directive}&rdquo;
        </p>

        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline" className="text-xs">{currentStage}</Badge>
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
          <Badge className={cn("text-xs", getDraftTypeBadgeClass("progress_task"))}>{targetStage}</Badge>
        </div>

        {(payload?.nextTaskType || payload?.customTaskName) && (
          <p className="text-xs text-muted-foreground">
            Next task: {payload.customTaskName || payload.nextTaskType?.replace(/_/g, " ").toLowerCase()}
          </p>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Next task date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal gap-2 h-8">
                <CalendarDays className="w-3 h-3" />
                {displayDate ? format(displayDate, "MMM d, yyyy") : "Auto (next office day)"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarWidget
                mode="single"
                selected={displayDate}
                onSelect={(date: Date | undefined) => {
                  setDateOverrides((prev) => ({ ...prev, [draft.id]: date }));
                }}
              />
            </PopoverContent>
          </Popover>
          {overrideDate && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={() => setDateOverrides((prev) => {
                const next = { ...prev };
                delete next[draft.id];
                return next;
              })}
            >
              Reset to Josh&apos;s suggestion
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => handleExecute(draft)}
            disabled={sendingId === draft.id}
            className="gap-1 bg-purple-600 hover:bg-purple-700 text-white"
          >
            {sendingId === draft.id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive gap-1 ml-auto"
            onClick={() => handleDiscard(draft.id)}
          >
            <X className="w-3 h-3" /> Discard
          </Button>
        </div>
      </div>
    );
  };

  const renderNoteCard = (draft: Draft) => {
    const payload = draft.actionPayload as { content?: string } | null;
    const noteContent = payload?.content || draft.body;

    return (
      <div key={draft.id} className="border rounded-lg p-4 space-y-3 border-emerald-200 dark:border-emerald-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {draft.contact.firstName} {draft.contact.lastName}
            </span>
            <Badge variant="secondary" className={cn("text-xs gap-1 py-0", getDraftTypeBadgeClass("add_note"))}>
              <StickyNote className="w-3 h-3" /> Note
            </Badge>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">
          &ldquo;{draft.directive}&rdquo;
        </p>

        {editingId === draft.id ? (
          <Textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={3}
            className="text-sm resize-none"
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap bg-emerald-50/50 dark:bg-emerald-950/20 rounded-md p-3">
            {noteContent}
          </p>
        )}

        <div className="flex items-center gap-2">
          {editingId === draft.id ? (
            <>
              <Button size="sm" onClick={() => handleSaveEdit(draft.id, "add_note")} className="gap-1">
                <Check className="w-3 h-3" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={() => handleExecute(draft)}
                disabled={sendingId === draft.id}
                className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {sendingId === draft.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleEdit(draft)} className="gap-1">
                <Edit2 className="w-3 h-3" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive gap-1 ml-auto"
                onClick={() => handleDiscard(draft.id)}
              >
                <X className="w-3 h-3" /> Discard
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderDateCard = (draft: Draft) => {
    const payload = draft.actionPayload as { date?: string; reason?: string } | null;
    const suggestedDate = payload?.date ? new Date(payload.date + "T12:00:00") : undefined;
    const overrideDate = dateOverrides[draft.id];
    const displayDate = overrideDate || suggestedDate;

    return (
      <div key={draft.id} className="border rounded-lg p-4 space-y-3 border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {draft.contact.firstName} {draft.contact.lastName}
            </span>
            <Badge variant="secondary" className={cn("text-xs gap-1 py-0", getDraftTypeBadgeClass("set_date"))}>
              <CalendarDays className="w-3 h-3" /> Set Date
            </Badge>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">
          &ldquo;{draft.directive}&rdquo;
        </p>

        {payload?.reason && (
          <p className="text-sm text-muted-foreground">
            {payload.reason}
          </p>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Task date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal gap-2 h-8">
                <CalendarDays className="w-3 h-3" />
                {displayDate ? format(displayDate, "MMM d, yyyy") : "No date set"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarWidget
                mode="single"
                selected={displayDate}
                onSelect={(date: Date | undefined) => {
                  setDateOverrides((prev) => ({ ...prev, [draft.id]: date }));
                }}
              />
            </PopoverContent>
          </Popover>
          {overrideDate && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={() => setDateOverrides((prev) => {
                const next = { ...prev };
                delete next[draft.id];
                return next;
              })}
            >
              Reset to Josh&apos;s suggestion
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => handleExecute(draft)}
            disabled={sendingId === draft.id || !displayDate}
            className="gap-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {sendingId === draft.id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive gap-1 ml-auto"
            onClick={() => handleDiscard(draft.id)}
          >
            <X className="w-3 h-3" /> Discard
          </Button>
        </div>
      </div>
    );
  };

  const renderResourceContactCard = (draft: Draft) => {
    const payload = draft.actionPayload as {
      resourceCompanyName?: string;
      resourceContactName?: string;
    } | null;

    return (
      <div key={draft.id} className="border rounded-lg p-4 space-y-3 border-orange-200 dark:border-orange-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {draft.contact.firstName} {draft.contact.lastName}
            </span>
            <Badge variant="secondary" className={cn("text-xs gap-1 py-0", getDraftTypeBadgeClass("contact_resource"))}>
              <Contact className="w-3 h-3" /> Resource
            </Badge>
          </div>
          <Badge variant="outline" className="text-xs gap-1 py-0">
            {draft.channel === "sms" ? (
              <><Phone className="w-3 h-3" /> Text</>
            ) : (
              <><Mail className="w-3 h-3" /> Email</>
            )}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground italic">
          &ldquo;{draft.directive}&rdquo;
        </p>

        <div className="flex items-center gap-2 text-sm">
          <Contact className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium">{payload?.resourceContactName || "Unknown"}</span>
          {payload?.resourceCompanyName && (
            <span className="text-muted-foreground">at {payload.resourceCompanyName}</span>
          )}
        </div>

        {draft.subject && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Subject:</span> {draft.subject}
          </p>
        )}

        {editingId === draft.id ? (
          <Textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={4}
            className="text-sm resize-none"
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap bg-orange-50/50 dark:bg-orange-950/20 rounded-md p-3">
            {draft.body}
          </p>
        )}

        <div className="flex items-center gap-2">
          {editingId === draft.id ? (
            <>
              <Button size="sm" onClick={() => handleSaveEdit(draft.id)} className="gap-1">
                <Check className="w-3 h-3" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={() => handleSend(draft)}
                disabled={sendingId === draft.id}
                className="gap-1 bg-orange-600 hover:bg-orange-700 text-white"
              >
                {sendingId === draft.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                Send to {payload?.resourceContactName?.split(" ")[0] || "Contact"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleEdit(draft)} className="gap-1">
                <Edit2 className="w-3 h-3" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive gap-1 ml-auto"
                onClick={() => handleDiscard(draft.id)}
              >
                <X className="w-3 h-3" /> Discard
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderDraftCard = (draft: Draft) => {
    const draftType = draft.draftType || "message";
    switch (draftType) {
      case "progress_task":
        return renderProgressCard(draft);
      case "add_note":
        return renderNoteCard(draft);
      case "set_date":
        return renderDateCard(draft);
      case "schedule_appointment":
        return renderAppointmentCard(draft);
      case "contact_resource":
        return renderResourceContactCard(draft);
      default:
        return renderMessageCard(draft);
    }
  };

  const renderAppointmentCard = (draft: Draft) => {
    const payload = draft.actionPayload as {
      appointmentType?: string;
      datetime?: string;
      description?: string;
    } | null;
    const apptDate = payload?.datetime ? new Date(payload.datetime) : undefined;

    return (
      <div key={draft.id} className="border rounded-lg p-4 space-y-3 border-teal-200 dark:border-teal-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {draft.contact.firstName} {draft.contact.lastName}
            </span>
            <Badge variant="secondary" className={cn("text-xs gap-1 py-0", getDraftTypeBadgeClass("schedule_appointment"))}>
              <CalendarDays className="w-3 h-3" /> Appointment
            </Badge>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">
          &ldquo;{draft.directive}&rdquo;
        </p>

        {payload?.appointmentType && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Type:</span>
            <Badge variant="outline" className="text-xs">{payload.appointmentType}</Badge>
          </div>
        )}

        {apptDate && (
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="w-3 h-3 text-muted-foreground" />
            <span>{format(apptDate, "EEE, MMM d 'at' h:mm a")}</span>
          </div>
        )}

        {payload?.description && (
          <p className="text-xs text-muted-foreground">{payload.description}</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="gap-1 flex-1"
            onClick={() => handleExecute(draft)}
            disabled={sendingId === draft.id}
          >
            {sendingId === draft.id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            Schedule
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDiscard(draft.id)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn(
            "fixed bottom-24 right-6 z-50 h-12 w-12 rounded-full shadow-lg",
            totalCount > 0 && "bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
          )}
        >
          <Inbox className="w-5 h-5" />
          {totalCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground"
            >
              {totalCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-lg flex flex-col overflow-hidden">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Inbox className="w-5 h-5" />
            Josh Outbox
            {pendingDrafts.length > 0 && (
              <Badge variant="secondary">{pendingDrafts.length} ready</Badge>
            )}
            {composingDrafts.length > 0 && (
              <Badge variant="outline" className="gap-1 text-amber-600 border-amber-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                {composingDrafts.length} composing
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Inbox className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No pending items.</p>
              <p className="text-sm mt-1">
                Use the Action button on tasks to send directives to Josh.
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {composingDrafts.length > 0 && (
                <div className="space-y-3">
                  {composingDrafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {draft.contact.firstName} {draft.contact.lastName}
                          </span>
                          <Badge variant="outline" className="text-xs gap-1 py-0 text-amber-600 border-amber-400">
                            <Zap className="w-3 h-3" />
                            Composing
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive gap-1 h-7"
                          onClick={() => handleDiscard(draft.id)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground italic">
                        &ldquo;{draft.directive}&rdquo;
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Josh is working on this...
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingDrafts.map((draft) => renderDraftCard(draft))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
