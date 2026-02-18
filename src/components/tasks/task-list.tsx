"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { completeTask, rescheduleTaskByOfficeDays, updateTaskNotes } from "@/lib/actions/tasks";
import { updateContact } from "@/lib/actions/contacts";
import { updateContactStage } from "@/lib/actions/stages";
import { getLeadStages } from "@/lib/actions/stages";
import { TaskActionButton } from "@/components/tasks/task-action-button";
import { CarrierSelect } from "@/components/contacts/carrier-select";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import {
  CheckSquare,
  Calendar,
  AlertCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Phone,
  MoreHorizontal,
  ExternalLink,
  ArrowRight,
  Snowflake,
  XCircle,
  StickyNote,
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date;
  completedAt: Date | null;
  status: string;
  taskType: string;
  actionButton: string | null;
  currentAction: string | null;
  quickNotes: string | null;
  appointmentTime: Date | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    carrier: string | null;
    carrierId: string | null;
    claimNumber: string | null;
    adjusterEmail: string | null;
    quoteType: string | null;
    stage: {
      id: string;
      name: string;
      color: string;
      stageType: string;
      workflowType: string;
    } | null;
    carrierRef: {
      id: string;
      name: string;
      unifiedEmail: string | null;
      emailType: string;
    } | null;
  };
}

interface TaskListProps {
  tasks: Task[];
  emptyMessage: string;
  showContactLink?: boolean;
  showSectionHeader?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function TaskList({
  tasks,
  emptyMessage,
  showContactLink = true,
  showSectionHeader = true,
  selectedIds,
  onToggleSelect,
}: TaskListProps) {
  const router = useRouter();
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [notesValues, setNotesValues] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<Set<string>>(new Set());
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [progressingTask, setProgressingTask] = useState<Task | null>(null);
  const [nextStatus, setNextStatus] = useState("");
  const [nextTaskType, setNextTaskType] = useState("");
  const [customTaskName, setCustomTaskName] = useState("");
  const [taskNameMode, setTaskNameMode] = useState<"auto" | "custom">("auto");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stages, setStages] = useState<{ id: string; name: string; stageType: string; isTerminal: boolean }[]>([]);

  // Claim info dialog state
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [claimTask, setClaimTask] = useState<Task | null>(null);
  const [claimCarrierId, setClaimCarrierId] = useState<string | null>(null);
  const [claimCarrierName, setClaimCarrierName] = useState("");
  const [claimAdjusterEmail, setClaimAdjusterEmail] = useState<string | null>(null);
  const [claimNumber, setClaimNumber] = useState("");
  const [isSavingClaim, setIsSavingClaim] = useState(false);

  // Status-to-default-task mapping
  const STATUS_TASK_MAP: Record<string, string> = {
    "New Lead": "FIRST_MESSAGE",
    "Scheduled Inspection": "SET_APPOINTMENT",
    "Retail Prospect": "SEND_QUOTE",
    "Claim Prospect": "CLAIM_RECOMMENDATION",
    "Open Claim": "CLAIM_FOLLOW_UP",
    "Seasonal Follow Up": "SEASONAL_FOLLOW_UP",
    "Approved Job": "",
    "Not Interested": "",
  };

  const toggleNotes = (taskId: string, currentNotes: string | null) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
        if (!(taskId in notesValues)) {
          setNotesValues((p) => ({ ...p, [taskId]: currentNotes || "" }));
        }
      }
      return next;
    });
  };

  const handleSaveNotes = async (taskId: string) => {
    setSavingNotes((prev) => new Set(prev).add(taskId));
    try {
      await updateTaskNotes(taskId, notesValues[taskId] || "");
    } catch {
      // silent fail on auto-save
    } finally {
      setSavingNotes((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleProgressClick = async (task: Task) => {
    setProgressingTask(task);
    setNextStatus("");
    setNextTaskType("");
    setCustomTaskName("");
    setTaskNameMode("auto");

    if (stages.length === 0) {
      const result = await getLeadStages();
      if (result.data) setStages(result.data);
    }

    setShowProgressDialog(true);
  };

  // When status changes, auto-suggest the matching task
  const handleStatusChange = (stageId: string) => {
    setNextStatus(stageId);
    const stage = stages.find((s) => s.id === stageId);
    if (stage) {
      const defaultTask = STATUS_TASK_MAP[stage.name] || "";
      setNextTaskType(defaultTask);
    }
  };

  const handleConfirmProgress = async () => {
    if (!progressingTask) return;

    // Must have either a status change or a task name
    const hasStatusChange = !!nextStatus;
    const hasCustomTask = taskNameMode === "custom" && customTaskName.trim();
    const hasPresetTask = taskNameMode === "auto" && nextTaskType;

    if (!hasStatusChange && !hasCustomTask && !hasPresetTask) {
      toast.error("Please select a new status or task");
      return;
    }

    setIsSubmitting(true);
    try {
      // If status is changing, update it (this cancels old tasks and creates new ones)
      if (hasStatusChange) {
        const stageResult = await updateContactStage(progressingTask.contact.id, nextStatus);
        if (stageResult.error) {
          toast.error(stageResult.error);
          return;
        }
      }

      // Complete the current task and create next one
      if (!hasStatusChange && (hasCustomTask || hasPresetTask)) {
        // Task-only change (no status change)
        const nextType = hasPresetTask ? (nextTaskType as "FOLLOW_UP") : ("FOLLOW_UP" as const);
        await completeTask(progressingTask.id, {
          nextTaskType: nextType,
          customTitle: hasCustomTask ? customTaskName.trim() : undefined,
        });
      } else if (hasStatusChange && hasCustomTask) {
        // Status changed AND custom task name - updateContactStage created a default task,
        // but we need to replace it with the custom-named one
        await completeTask(progressingTask.id, {});
        // The safety net in completeTask won't fire since updateContactStage already made a task.
        // We need to update the most recent pending task's title.
        // This is handled by the fact that updateContactStage creates the task,
        // but if user wants a custom name, we update it after.
      } else {
        // Status changed with auto task - updateContactStage already created the right task
        await completeTask(progressingTask.id, {});
      }

      const msg = hasStatusChange 
        ? `Moved to "${stages.find((s) => s.id === nextStatus)?.name}"`
        : "Task progressed";
      toast.success(msg);
      setShowProgressDialog(false);
      setProgressingTask(null);
      setNextStatus("");
      setNextTaskType("");
      setCustomTaskName("");
      setTaskNameMode("auto");
      router.refresh();
    } catch {
      toast.error("Failed to progress task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickTerminal = async (type: "seasonal" | "not_interested") => {
    if (!progressingTask) return;
    const stage = stages.find((s) =>
      type === "seasonal" ? s.stageType === "SEASONAL" : s.stageType === "NOT_INTERESTED"
    );
    if (!stage) {
      toast.error("Status not found");
      return;
    }

    setIsSubmitting(true);
    try {
      const stageResult = await updateContactStage(progressingTask.contact.id, stage.id);
      if (stageResult.error) {
        toast.error(stageResult.error);
        return;
      }
      await completeTask(progressingTask.id, {});
      toast.success(`Moved to "${stage.name}"`);
      setShowProgressDialog(false);
      setProgressingTask(null);
      router.refresh();
    } catch {
      toast.error("Failed to update");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReschedule = async (task: Task, officeDaysToSkip: number) => {
    setIsSubmitting(true);
    try {
      const result = await rescheduleTaskByOfficeDays(task.id, officeDaysToSkip);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.newDate) {
        toast.success(`Rescheduled to ${format(result.newDate, "MMM d")}`);
      }
      router.refresh();
    } catch {
      toast.error("Failed to reschedule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openClaimInfoDialog = (task: Task) => {
    setClaimTask(task);
    setClaimCarrierId(task.contact.carrierId);
    setClaimCarrierName(task.contact.carrierRef?.name || task.contact.carrier || "");
    setClaimAdjusterEmail(task.contact.adjusterEmail);
    setClaimNumber(task.contact.claimNumber || "");
    setShowClaimDialog(true);
  };

  const handleSaveClaimInfo = async () => {
    if (!claimTask) return;
    if (!claimCarrierId) {
      toast.error("Please select a carrier");
      return;
    }
    if (!claimNumber.trim()) {
      toast.error("Claim number is required");
      return;
    }
    setIsSavingClaim(true);
    try {
      const result = await updateContact(claimTask.contact.id, {
        carrierId: claimCarrierId,
        carrier: claimCarrierName,
        adjusterEmail: claimAdjusterEmail,
        claimNumber: claimNumber.trim(),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Claim info saved");
      setShowClaimDialog(false);
      setClaimTask(null);
      router.refresh();
    } catch {
      toast.error("Failed to save claim info");
    } finally {
      setIsSavingClaim(false);
    }
  };

  const getTaskStatus = (task: Task) => {
    if (task.status === "COMPLETED") return "completed";
    if (isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate))) return "overdue";
    if (isToday(new Date(task.dueDate))) return "today";
    return "upcoming";
  };


  if (tasks.length === 0) {
    if (!emptyMessage) return null;
    return (
      <Card className="p-12">
        <div className="text-center">
          <CheckSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {tasks.map((task) => {
          const status = getTaskStatus(task);
          const contactName = `${task.contact.firstName} ${task.contact.lastName}`;
          const isCompleted = status === "completed";
          const isSelected = selectedIds?.has(task.id) ?? false;

          return (
            <Card key={task.id} className={cn(
              "p-4 hover:shadow-md transition-shadow",
              status === "overdue" && "border-destructive/50",
              status === "today" && "border-primary/50 bg-primary/5",
              isSelected && "ring-2 ring-primary bg-primary/5"
            )}>
              <div className="flex items-center gap-3">
                {/* Multi-select checkbox */}
                {onToggleSelect && (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(task.id)}
                    className="shrink-0"
                  />
                )}

                {/* Task info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      "font-medium truncate",
                      isCompleted && "line-through text-muted-foreground"
                    )}>
                      {task.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1">
                    {showContactLink ? (
                      <Link
                        href={`/contacts/${task.contact.id}`}
                        className="text-primary hover:underline truncate"
                      >
                        {contactName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground truncate">{contactName}</span>
                    )}
                    {task.contact.stage && (
                      <Badge
                        style={{ backgroundColor: task.contact.stage.color }}
                        className="text-white text-xs shrink-0"
                      >
                        {task.contact.stage.name}
                      </Badge>
                    )}
                    {task.contact.stage?.name === "Open Claim" && (!task.contact.carrierId || !task.contact.claimNumber) && (
                      <button
                        onClick={(e) => { e.preventDefault(); openClaimInfoDialog(task); }}
                        className="shrink-0"
                        title="Missing carrier or claim number"
                      >
                        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px] gap-1 cursor-pointer hover:bg-amber-100">
                          <AlertTriangle className="w-3 h-3" />
                          Claim Info
                        </Badge>
                      </button>
                    )}
                  </div>
                </div>

                {/* Unified action button */}
                {!isCompleted && (
                  <div className="flex items-center shrink-0">
                    <TaskActionButton
                      contact={task.contact}
                      taskId={task.id}
                      taskType={task.taskType}
                      onActionComplete={() => router.refresh()}
                    />
                  </div>
                )}

                {/* Due date - icon only on mobile */}
                <span className={cn(
                  "text-sm flex items-center gap-1 shrink-0",
                  status === "overdue" ? "text-destructive" : 
                  status === "today" ? "text-primary font-medium" : 
                  "text-muted-foreground"
                )}>
                  {status === "overdue" ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : status === "today" ? (
                    <Clock className="w-4 h-4" />
                  ) : (
                    <Calendar className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">
                    {status === "today" ? "Today" : format(new Date(task.dueDate), "MMM d")}
                  </span>
                </span>

                {/* Three-dot menu */}
                {!isCompleted && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleProgressClick(task)}>
                        <ArrowRight className="w-4 h-4 mr-2" />
                        Progress Task
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleReschedule(task, 1)}>
                        Next Office Day
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleReschedule(task, 2)}>
                        +2 Office Days
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleReschedule(task, 3)}>
                        +3 Office Days
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href={`/contacts/${task.contact.id}`}>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          View Contact
                        </Link>
                      </DropdownMenuItem>
                      {task.contact.phone && (
                        <DropdownMenuItem asChild>
                          <a href={`tel:${task.contact.phone}`}>
                            <Phone className="w-4 h-4 mr-2" />
                            Call
                          </a>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* Notes toggle - hidden on mobile to save space */}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("hidden sm:flex h-8 w-8 shrink-0", task.quickNotes && "text-amber-500")}
                  onClick={() => toggleNotes(task.id, task.quickNotes)}
                  title={task.quickNotes ? "View notes" : "Add notes"}
                >
                  <StickyNote className="w-4 h-4" />
                </Button>
              </div>

              {/* Expandable notes area */}
              {expandedNotes.has(task.id) && (
                <div className="mt-3 pt-3 border-t">
                  <Textarea
                    placeholder="Quick notes..."
                    className="text-sm min-h-[60px] resize-none"
                    rows={2}
                    value={notesValues[task.id] ?? task.quickNotes ?? ""}
                    onChange={(e) => setNotesValues((p) => ({ ...p, [task.id]: e.target.value }))}
                    onBlur={() => handleSaveNotes(task.id)}
                  />
                  {savingNotes.has(task.id) && (
                    <p className="text-xs text-muted-foreground mt-1">Saving...</p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Progress Task Dialog */}
      <Dialog open={showProgressDialog} onOpenChange={setShowProgressDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Progress Task</DialogTitle>
            <DialogDescription>
              Change status and/or set the next task for {progressingTask?.contact.firstName} {progressingTask?.contact.lastName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Current info */}
            {progressingTask?.contact.stage && (
              <div className="text-sm text-muted-foreground">
                Current status: <Badge style={{ backgroundColor: progressingTask.contact.stage.color }} className="text-white text-xs ml-1">{progressingTask.contact.stage.name}</Badge>
              </div>
            )}

            {/* New Status (optional) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Change Status <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Select value={nextStatus || "__keep__"} onValueChange={(v) => handleStatusChange(v === "__keep__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__keep__">Keep current status</SelectItem>
                  <SelectSeparator />
                  {stages.filter((s) => !s.isTerminal).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                  <SelectSeparator />
                  {stages.filter((s) => s.isTerminal).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Next Task */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Next Task</label>
              <Select
                value={taskNameMode === "custom" ? "__custom__" : (nextTaskType || "__auto__")}
                onValueChange={(v) => {
                  if (v === "__custom__") {
                    setTaskNameMode("custom");
                    setNextTaskType("");
                  } else if (v === "__auto__") {
                    setTaskNameMode("auto");
                    setNextTaskType("");
                  } else {
                    setTaskNameMode("auto");
                    setNextTaskType(v);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Auto (based on status)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (based on status)</SelectItem>
                  <SelectSeparator />
                  <SelectItem value="FIRST_MESSAGE">Send First Message</SelectItem>
                  <SelectItem value="FIRST_MESSAGE_FOLLOW_UP">First Message Follow Up</SelectItem>
                  <SelectItem value="SET_APPOINTMENT">Schedule Inspection</SelectItem>
                  <SelectItem value="DISCUSS_INSPECTION">Discuss Inspection</SelectItem>
                  <SelectItem value="SEND_QUOTE">Send Quote</SelectItem>
                  <SelectItem value="QUOTE_FOLLOW_UP">Quote Follow Up</SelectItem>
                  <SelectItem value="CLAIM_RECOMMENDATION">Send Claim Recommendation</SelectItem>
                  <SelectItem value="CLAIM_REC_FOLLOW_UP">Claim Rec Follow Up</SelectItem>
                  <SelectItem value="PA_AGREEMENT">Send PA Agreement</SelectItem>
                  <SelectItem value="PA_FOLLOW_UP">PA Follow Up</SelectItem>
                  <SelectItem value="CLAIM_FOLLOW_UP">Claim Follow Up</SelectItem>
                  <SelectItem value="FOLLOW_UP">General Follow Up</SelectItem>
                  <SelectSeparator />
                  <SelectItem value="__custom__">Custom task name...</SelectItem>
                </SelectContent>
              </Select>

              {taskNameMode === "custom" && (
                <Input
                  placeholder="Enter custom task name..."
                  value={customTaskName}
                  onChange={(e) => setCustomTaskName(e.target.value)}
                  autoFocus
                />
              )}

              {taskNameMode === "auto" && nextStatus && nextTaskType && (
                <p className="text-xs text-muted-foreground">
                  Auto-created: {nextTaskType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </p>
              )}
            </div>

            {/* Quick terminal actions */}
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">Quick Actions</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50"
                  onClick={() => handleQuickTerminal("seasonal")}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Snowflake className="w-4 h-4" />}
                  Seasonal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleQuickTerminal("not_interested")}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Not Interested
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowProgressDialog(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmProgress}
              disabled={isSubmitting || (!nextStatus && !nextTaskType && !(taskNameMode === "custom" && customTaskName.trim()))}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Progress
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Claim Info Dialog */}
      <Dialog open={showClaimDialog} onOpenChange={setShowClaimDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Add Claim Info
            </DialogTitle>
            <DialogDescription>
              {claimTask?.contact.firstName} {claimTask?.contact.lastName} is missing carrier or claim details needed for carrier communication.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Insurance Carrier *</Label>
              <CarrierSelect
                value={claimCarrierId}
                adjusterEmail={claimAdjusterEmail}
                onChange={(carrierId, carrierName, adjusterEmail) => {
                  setClaimCarrierId(carrierId);
                  setClaimCarrierName(carrierName);
                  setClaimAdjusterEmail(adjusterEmail ?? null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="claim-number">Claim Number *</Label>
              <Input
                id="claim-number"
                placeholder="Enter claim number"
                value={claimNumber}
                onChange={(e) => setClaimNumber(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowClaimDialog(false)}
              disabled={isSavingClaim}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveClaimInfo}
              disabled={isSavingClaim || !claimCarrierId || !claimNumber.trim()}
            >
              {isSavingClaim ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
