"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { completeTask, rescheduleTask } from "@/lib/actions/tasks";
import { rescheduleFollowUp } from "@/lib/workflow-engine";
import { TemplateSelector } from "@/components/templates/template-selector";
import { composeSMSUrl, composeEmailUrl } from "@/lib/messaging";
import { type TemplateContext } from "@/lib/templates";
import { format, isPast, isToday, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  CheckSquare,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Clock,
  Loader2,
  MessageSquare,
  Mail,
  Phone,
  MoreHorizontal,
  RefreshCw,
  ArrowRight,
  FileText,
  Shield,
  ExternalLink,
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
  appointmentTime: Date | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    carrier: string | null;
    quoteType: string | null;
    stage: {
      id: string;
      name: string;
      color: string;
      stageType: string;
      workflowType: string;
    } | null;
  };
}

interface TaskListProps {
  tasks: Task[];
  emptyMessage: string;
  showContactLink?: boolean;
  showSectionHeader?: boolean;
}

// Map task types to template categories
const taskTypeToCategory: Record<string, string> = {
  FIRST_MESSAGE: "FIRST_MESSAGE",
  QUOTE_FOLLOW_UP: "QUOTE_FOLLOW_UP",
  CLAIM_RECOMMENDATION: "CLAIM_RECOMMENDATION",
  CLAIM_REC_FOLLOW_UP: "CLAIM_REC_FOLLOW_UP",
  PA_AGREEMENT: "PA_AGREEMENT",
  PA_FOLLOW_UP: "PA_FOLLOW_UP",
  CLAIM_FOLLOW_UP: "CLAIM_FOLLOW_UP",
  SEND_QUOTE: "QUOTE",
};

// Task types that should auto-reschedule when completing
const autoRescheduleTypes = [
  "QUOTE_FOLLOW_UP",
  "CLAIM_REC_FOLLOW_UP",
  "PA_FOLLOW_UP",
  "CLAIM_FOLLOW_UP",
];

export function TaskList({ tasks, emptyMessage, showContactLink = true, showSectionHeader = true }: TaskListProps) {
  const router = useRouter();
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [nextTaskType, setNextTaskType] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [templateConfig, setTemplateConfig] = useState<{
    category: string;
    preferredType: "sms" | "email";
    title: string;
  } | null>(null);

  const handleCompleteClick = (task: Task) => {
    // For auto-reschedule types, complete directly
    if (autoRescheduleTypes.includes(task.taskType)) {
      handleQuickComplete(task, true);
    } else {
      setCompletingTask(task);
      setShowCompleteDialog(true);
    }
  };

  const handleQuickComplete = async (task: Task, reschedule: boolean = false) => {
    setIsSubmitting(true);
    try {
      const result = await completeTask(task.id, { reschedule });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(reschedule ? "Task completed - follow-up rescheduled" : "Task completed!");
      router.refresh();
    } catch {
      toast.error("Failed to complete task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmComplete = async () => {
    if (!completingTask) return;

    setIsSubmitting(true);
    try {
      const result = await completeTask(completingTask.id, { 
        nextTaskType: nextTaskType as "FIRST_MESSAGE" | "SET_APPOINTMENT" | "APPOINTMENT" | "ASSIGN_STATUS" | "SEND_QUOTE" | "QUOTE_FOLLOW_UP" | "CLAIM_RECOMMENDATION" | "CLAIM_REC_FOLLOW_UP" | "PA_AGREEMENT" | "PA_FOLLOW_UP" | "CLAIM_FOLLOW_UP" | "FOLLOW_UP" | "CUSTOM" | undefined,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Task completed!");
      setShowCompleteDialog(false);
      setCompletingTask(null);
      setNextTaskType("");
      router.refresh();
    } catch {
      toast.error("Failed to complete task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReschedule = async (task: Task, daysToAdd: number) => {
    setIsSubmitting(true);
    try {
      const newDate = addDays(new Date(), daysToAdd);
      const result = await rescheduleTask(task.id, newDate);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Rescheduled to ${format(newDate, "MMM d")}`);
      router.refresh();
    } catch {
      toast.error("Failed to reschedule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenTemplate = (task: Task) => {
    const category = taskTypeToCategory[task.taskType] || "GENERAL";
    const preferredType = ["FIRST_MESSAGE", "QUOTE_FOLLOW_UP", "CLAIM_REC_FOLLOW_UP", "PA_FOLLOW_UP", "CLAIM_FOLLOW_UP"].includes(task.taskType) 
      ? "sms" as const 
      : "email" as const;
    
    setSelectedTask(task);
    setTemplateConfig({
      category,
      preferredType,
      title: task.title,
    });
    setShowTemplateSelector(true);
  };

  const handleTemplateSelect = (message: string, type: "sms" | "email", subject?: string) => {
    if (!selectedTask) return;
    
    const contact = selectedTask.contact;
    
    if (type === "sms" && contact.phone) {
      window.location.href = composeSMSUrl(contact.phone, message);
    } else if (type === "email" && contact.email) {
      window.location.href = composeEmailUrl(contact.email, subject || "", message);
    } else {
      navigator.clipboard.writeText(message);
      toast.success("Message copied to clipboard");
    }

    // For follow-up types, auto-reschedule after sending
    if (autoRescheduleTypes.includes(selectedTask.taskType)) {
      handleQuickComplete(selectedTask, true);
    }
  };

  const getTaskStatus = (task: Task) => {
    if (task.status === "COMPLETED") return "completed";
    if (isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate))) return "overdue";
    if (isToday(new Date(task.dueDate))) return "today";
    return "upcoming";
  };

  const getActionButton = (task: Task) => {
    const actionButton = task.actionButton || task.taskType;
    
    switch (actionButton) {
      case "SEND_FIRST_MESSAGE":
      case "FIRST_MESSAGE":
        return {
          label: "Send Message",
          icon: MessageSquare,
          onClick: () => handleOpenTemplate(task),
          disabled: !task.contact.phone,
        };
      case "SEND_QUOTE":
        return {
          label: "Send Quote",
          icon: Mail,
          onClick: () => handleOpenTemplate(task),
          disabled: !task.contact.email,
        };
      case "SEND_QUOTE_FOLLOW_UP":
      case "QUOTE_FOLLOW_UP":
        return {
          label: "Send Follow Up",
          icon: RefreshCw,
          onClick: () => handleOpenTemplate(task),
        };
      case "SEND_CLAIM_REC":
      case "CLAIM_RECOMMENDATION":
        return {
          label: "Send Claim Rec",
          icon: Shield,
          onClick: () => handleOpenTemplate(task),
          disabled: !task.contact.email,
        };
      case "SEND_CLAIM_FOLLOW_UP":
      case "CLAIM_REC_FOLLOW_UP":
      case "CLAIM_FOLLOW_UP":
        return {
          label: "Send Follow Up",
          icon: RefreshCw,
          onClick: () => handleOpenTemplate(task),
        };
      case "SEND_PA_AGREEMENT":
      case "PA_AGREEMENT":
        return {
          label: "Send PA",
          icon: FileText,
          onClick: () => handleOpenTemplate(task),
          disabled: !task.contact.email,
        };
      case "SEND_PA_FOLLOW_UP":
      case "PA_FOLLOW_UP":
        return {
          label: "Send Follow Up",
          icon: RefreshCw,
          onClick: () => handleOpenTemplate(task),
        };
      case "SCHEDULE_INSPECTION":
      case "SET_APPOINTMENT":
        return {
          label: "Schedule",
          icon: Calendar,
          onClick: () => router.push(`/contacts/${task.contact.id}?action=schedule`),
        };
      case "ASSIGN_STATUS":
        return {
          label: "Assign Status",
          icon: ArrowRight,
          onClick: () => router.push(`/contacts/${task.contact.id}?action=assign`),
        };
      default:
        return null;
    }
  };

  if (tasks.length === 0) {
    // Don't render anything if no empty message (used in sectioned views)
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
      <div className="space-y-3">
        {tasks.map((task) => {
          const status = getTaskStatus(task);
          const contactName = `${task.contact.firstName} ${task.contact.lastName}`;
          const actionButton = getActionButton(task);
          const isCompleted = status === "completed";

          // Build template context for this task
          const templateContext: TemplateContext = {
            contact: {
              firstName: task.contact.firstName,
              lastName: task.contact.lastName,
              email: task.contact.email,
              phone: task.contact.phone,
              address: task.contact.address,
              carrier: task.contact.carrier,
              quoteType: task.contact.quoteType,
            },
          };

          return (
            <Card key={task.id} className={cn(
              "p-4 hover:shadow-md transition-shadow",
              status === "overdue" && "border-destructive/50",
              status === "today" && "border-primary/50 bg-primary/5"
            )}>
              <div className="flex items-center gap-4">
                {/* Complete checkbox */}
                <button
                  onClick={() => !isCompleted && handleCompleteClick(task)}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                    isCompleted
                      ? "bg-primary border-primary text-primary-foreground"
                      : status === "overdue"
                      ? "border-destructive hover:bg-destructive/10"
                      : "border-muted-foreground/30 hover:border-primary hover:bg-primary/10"
                  )}
                  disabled={isCompleted || isSubmitting}
                >
                  {isCompleted && <CheckCircle2 className="w-4 h-4" />}
                </button>

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
                  </div>
                </div>

                {/* Action button */}
                {!isCompleted && actionButton && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 hidden sm:flex"
                    onClick={actionButton.onClick}
                    disabled={actionButton.disabled || isSubmitting}
                  >
                    <actionButton.icon className="w-4 h-4" />
                    {actionButton.label}
                  </Button>
                )}

                {/* Due date */}
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

                {/* More actions */}
                {!isCompleted && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {actionButton && (
                        <>
                          <DropdownMenuItem 
                            onClick={actionButton.onClick}
                            disabled={actionButton.disabled}
                            className="sm:hidden"
                          >
                            <actionButton.icon className="w-4 h-4 mr-2" />
                            {actionButton.label}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="sm:hidden" />
                        </>
                      )}
                      <DropdownMenuItem onClick={() => handleCompleteClick(task)}>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Complete Task
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleReschedule(task, 1)}>
                        Reschedule to Tomorrow
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleReschedule(task, 3)}>
                        Reschedule +3 Days
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleReschedule(task, 7)}>
                        Reschedule +1 Week
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
              </div>
            </Card>
          );
        })}
      </div>

      {/* Template Selector */}
      {templateConfig && selectedTask && (
        <TemplateSelector
          open={showTemplateSelector}
          onOpenChange={setShowTemplateSelector}
          category={templateConfig.category}
          context={{
            contact: {
              firstName: selectedTask.contact.firstName,
              lastName: selectedTask.contact.lastName,
              email: selectedTask.contact.email,
              phone: selectedTask.contact.phone,
              address: selectedTask.contact.address,
              carrier: selectedTask.contact.carrier,
              quoteType: selectedTask.contact.quoteType,
            },
          }}
          preferredType={templateConfig.preferredType}
          title={templateConfig.title}
          onSelect={handleTemplateSelect}
        />
      )}

      {/* Complete Task Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Task</DialogTitle>
            <DialogDescription>
              What&apos;s the next step for this contact?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Select value={nextTaskType} onValueChange={setNextTaskType}>
              <SelectTrigger>
                <SelectValue placeholder="Select next action..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No follow-up needed</SelectItem>
                <SelectItem value="FOLLOW_UP">General Follow Up</SelectItem>
                <SelectItem value="SET_APPOINTMENT">Schedule Inspection</SelectItem>
                <SelectItem value="SEND_QUOTE">Send Quote</SelectItem>
                <SelectItem value="CLAIM_RECOMMENDATION">Send Claim Recommendation</SelectItem>
              </SelectContent>
            </Select>
            {nextTaskType && nextTaskType !== "NONE" && (
              <p className="text-sm text-muted-foreground">
                A new task will be created for the next office day.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCompleteDialog(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmComplete} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Complete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
