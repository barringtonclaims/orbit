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
import { toast } from "sonner";
import { composeSMSUrl, composeEmailUrl } from "@/lib/messaging";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

interface Draft {
  id: string;
  channel: string;
  recipientType: string;
  subject: string | null;
  body: string;
  directive: string;
  status: string;
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

  // Poll faster (2s) when composing, normal (5s) when sheet is open, slow (15s) background
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

  const handleSaveEdit = async (draftId: string) => {
    try {
      await fetch("/api/josh/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draftId,
          body: editBody,
          subject: editSubject || null,
        }),
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
              <p>No pending messages.</p>
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
                        Josh is writing this message...
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="border rounded-lg p-4 space-y-3"
                >
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
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(draft.id)}
                          className="gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                        >
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(draft)}
                          className="gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive gap-1 ml-auto"
                          onClick={() => handleDiscard(draft.id)}
                        >
                          <X className="w-3 h-3" />
                          Discard
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
