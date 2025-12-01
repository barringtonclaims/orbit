"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { completeTask } from "@/lib/actions/tasks";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import {
  CheckSquare,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Clock,
  Loader2,
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date;
  completedAt: Date | null;
  status: string;
  taskType: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    stage: {
      name: string;
      color: string;
    } | null;
  };
}

interface TaskListProps {
  tasks: Task[];
  emptyMessage: string;
}

const nextTaskOptions = [
  { value: "", label: "None - No follow-up needed" },
  { value: "FOLLOW_UP", label: "Follow Up" },
  { value: "SET_APPOINTMENT", label: "Set Initial Inspection" },
  { value: "WRITE_QUOTE", label: "Write Quote" },
  { value: "SEND_QUOTE", label: "Send Quote" },
  { value: "CLAIM_RECOMMENDATION", label: "Send Claim Recommendation" },
];

export function TaskList({ tasks, emptyMessage }: TaskListProps) {
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [nextTaskType, setNextTaskType] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCompleteClick = (taskId: string) => {
    setCompletingTaskId(taskId);
    setShowCompleteDialog(true);
  };

  const handleConfirmComplete = async () => {
    if (!completingTaskId) return;

    setIsSubmitting(true);

    try {
      const result = await completeTask(completingTaskId, nextTaskType || undefined);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Task completed!");
      setShowCompleteDialog(false);
      setCompletingTaskId(null);
      setNextTaskType("");
    } catch {
      toast.error("Failed to complete task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTaskStatus = (task: Task) => {
    if (task.status === "COMPLETED") return "completed";
    if (isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate))) return "overdue";
    if (isToday(new Date(task.dueDate))) return "today";
    return "upcoming";
  };

  if (tasks.length === 0) {
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

          return (
            <Card key={task.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleCompleteClick(task.id)}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                    status === "completed"
                      ? "bg-primary border-primary text-primary-foreground"
                      : status === "overdue"
                      ? "border-destructive hover:bg-destructive/10"
                      : "border-muted-foreground/30 hover:border-primary hover:bg-primary/10"
                  )}
                  disabled={status === "completed"}
                >
                  {status === "completed" && <CheckCircle2 className="w-4 h-4" />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "font-medium",
                    status === "completed" && "line-through text-muted-foreground"
                  )}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <Link
                      href={`/contacts/${task.contact.id}`}
                      className="text-primary hover:underline"
                    >
                      {contactName}
                    </Link>
                    {task.contact.stage && (
                      <Badge
                        style={{ backgroundColor: task.contact.stage.color }}
                        className="text-white text-xs"
                      >
                        {task.contact.stage.name}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="hidden sm:flex">
                    {task.taskType.replace(/_/g, " ")}
                  </Badge>
                  <span className={cn(
                    "text-sm flex items-center gap-1",
                    status === "overdue" ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {status === "overdue" ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : status === "today" ? (
                      <Clock className="w-4 h-4 text-primary" />
                    ) : (
                      <Calendar className="w-4 h-4" />
                    )}
                    {format(new Date(task.dueDate), "MMM d")}
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Complete Task Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              What&apos;s the next step for this contact?
            </p>
            <Select value={nextTaskType} onValueChange={setNextTaskType}>
              <SelectTrigger>
                <SelectValue placeholder="Select next action..." />
              </SelectTrigger>
              <SelectContent>
                {nextTaskOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {nextTaskType && (
              <p className="text-sm text-muted-foreground">
                A new task will be created for the next M/W/F.
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

