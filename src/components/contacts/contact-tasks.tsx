"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { completeTask, createTask, updateTask } from "@/lib/actions/tasks";
import { type TaskTypeForTitle } from "@/lib/scheduling";
import { getNextOfficeDay } from "@/lib/scheduling";
import { format, formatDistanceToNow, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Calendar as CalendarIcon,
  Loader2,
  CheckSquare,
  MoreVertical,
  Edit,
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date;
  completedAt: Date | null;
  status: string;
  taskType: string;
}

interface ContactTasksProps {
  contactId: string;
  tasks: Task[];
}

const taskTypeOptions = [
  { value: "FOLLOW_UP", label: "Follow Up" },
  { value: "SET_APPOINTMENT", label: "Set Appointment" },
  { value: "WRITE_QUOTE", label: "Write Quote" },
  { value: "SEND_QUOTE", label: "Send Quote" },
  { value: "CLAIM_RECOMMENDATION", label: "Claim Recommendation" },
  { value: "CUSTOM", label: "Custom" },
];

const nextTaskOptions = [
  { value: "NONE", label: "None - No follow-up needed" },
  { value: "FOLLOW_UP", label: "Follow Up" },
  { value: "SET_APPOINTMENT", label: "Set Initial Inspection" },
  { value: "WRITE_QUOTE", label: "Write Quote" },
  { value: "SEND_QUOTE", label: "Send Quote" },
  { value: "CLAIM_RECOMMENDATION", label: "Send Claim Recommendation" },
];

export function ContactTasks({ contactId, tasks }: ContactTasksProps) {
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  
  const [nextTaskType, setNextTaskType] = useState("NONE");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskType, setNewTaskType] = useState<TaskTypeForTitle>("FOLLOW_UP");
  const [newTaskDate, setNewTaskDate] = useState<Date | undefined>(new Date());

  // Edit task form state
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState<Date | undefined>();

  const pendingTasks = tasks.filter(t => t.status === "PENDING" || t.status === "IN_PROGRESS");
  const completedTasks = tasks.filter(t => t.status === "COMPLETED");

  const handleCompleteClick = (taskId: string) => {
    setCompletingTaskId(taskId);
    setNextTaskType("NONE");
    setShowCompleteDialog(true);
  };

  const handleEditClick = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditDate(new Date(task.dueDate));
    setShowEditDialog(true);
  };

  const handleConfirmComplete = async () => {
    if (!completingTaskId) return;

    setIsSubmitting(true);

    try {
      const options = nextTaskType === "NONE" 
        ? undefined 
        : { nextTaskType: nextTaskType as TaskTypeForTitle };
      const result = await completeTask(completingTaskId, options);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Task completed!");
      setShowCompleteDialog(false);
      setCompletingTaskId(null);
      setNextTaskType("NONE");
    } catch {
      toast.error("Failed to complete task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim() || !newTaskDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createTask({
        contactId,
        title: newTaskTitle,
        dueDate: newTaskDate,
        taskType: newTaskType,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Task created!");
      setShowNewTaskDialog(false);
      setNewTaskTitle("");
      setNewTaskType("FOLLOW_UP");
      setNewTaskDate(new Date());
    } catch {
      toast.error("Failed to create task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTask = async () => {
    if (!editingTask || !editTitle.trim() || !editDate) return;

    setIsSubmitting(true);

    try {
      const result = await updateTask(editingTask.id, {
        title: editTitle,
        description: editDescription,
        dueDate: editDate,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Task updated!");
      setShowEditDialog(false);
      setEditingTask(null);
    } catch {
      toast.error("Failed to update task");
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

  const TaskItem = ({ task }: { task: Task }) => {
    const status = getTaskStatus(task);

    return (
      <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors group">
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
            "font-medium truncate",
            status === "completed" && "line-through text-muted-foreground"
          )}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              {task.taskType.replace(/_/g, " ")}
            </Badge>
            <span className="flex items-center gap-1">
              {status === "overdue" ? (
                <AlertCircle className="w-3 h-3 text-destructive" />
              ) : status === "today" ? (
                <Clock className="w-3 h-3 text-primary" />
              ) : (
                <CalendarIcon className="w-3 h-3" />
              )}
              {status === "completed" 
                ? `Completed ${formatDistanceToNow(new Date(task.completedAt!), { addSuffix: true })}`
                : format(new Date(task.dueDate), "MMM d, yyyy")
              }
            </span>
          </div>
        </div>

        {status !== "completed" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleEditClick(task)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-end">
        <Button onClick={() => setShowNewTaskDialog(true)} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Add Task
        </Button>
      </div>

      {/* Pending Tasks */}
      {pendingTasks.length === 0 && completedTasks.length === 0 ? (
        <Card className="p-8">
          <div className="text-center">
            <CheckSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No tasks yet</p>
            <p className="text-sm text-muted-foreground/75 mb-4">
              Create a task to track follow-ups for this contact
            </p>
            <Button onClick={() => setShowNewTaskDialog(true)} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Create First Task
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {pendingTasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Pending</h3>
              <div className="space-y-2">
                {pendingTasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {completedTasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Completed</h3>
              <div className="space-y-2">
                {completedTasks.slice(0, 5).map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
                {completedTasks.length > 5 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    + {completedTasks.length - 5} more completed tasks
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
            {nextTaskType !== "NONE" && (
              <p className="text-sm text-muted-foreground">
                A new task will be created for the next available Office Day.
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

      {/* New Task Dialog */}
      <Dialog open={showNewTaskDialog} onOpenChange={setShowNewTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="taskTitle">Task Title</Label>
              <Input
                id="taskTitle"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="e.g., Follow up on quote"
              />
            </div>

            <div className="space-y-2">
              <Label>Task Type</Label>
              <Select value={newTaskType} onValueChange={(value) => setNewTaskType(value as TaskTypeForTitle)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {taskTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {newTaskDate ? format(newTaskDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={newTaskDate}
                    onSelect={setNewTaskDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewTaskDialog(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateTask} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Create Task"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editTitle">Task Title</Label>
              <Input
                id="editTitle"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="editDescription">Description</Label>
              <Textarea
                id="editDescription"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {editDate ? format(editDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={editDate}
                    onSelect={setEditDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateTask} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
