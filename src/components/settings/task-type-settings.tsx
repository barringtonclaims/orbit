"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createCustomTaskType,
  updateCustomTaskType,
  deleteCustomTaskType,
} from "@/lib/actions/custom-types";
import { Plus, Edit2, Trash2, Loader2, ListTodo } from "lucide-react";

export interface CustomTaskTypeRecord {
  id: string;
  name: string;
  description: string | null;
  defaultDueDays: number | null;
  stageId: string | null;
  isSystem: boolean;
  order: number;
  stage?: { id: string; name: string; color: string } | null;
}

interface Stage {
  id: string;
  name: string;
  color: string;
}

interface TaskTypeSettingsProps {
  initialTypes: CustomTaskTypeRecord[];
  stages: Stage[];
}

export function TaskTypeSettings({ initialTypes, stages }: TaskTypeSettingsProps) {
  const router = useRouter();
  const [types, setTypes] = useState<CustomTaskTypeRecord[]>(initialTypes);
  const [showDialog, setShowDialog] = useState(false);
  const [editingType, setEditingType] = useState<CustomTaskTypeRecord | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingType, setDeletingType] = useState<CustomTaskTypeRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultDueDays, setDefaultDueDays] = useState<string>("");
  const [stageId, setStageId] = useState<string>("none");

  const resetForm = () => {
    setName("");
    setDescription("");
    setDefaultDueDays("");
    setStageId("none");
    setEditingType(null);
  };

  const openCreate = () => {
    resetForm();
    setShowDialog(true);
  };

  const openEdit = (type: CustomTaskTypeRecord) => {
    setEditingType(type);
    setName(type.name);
    setDescription(type.description || "");
    setDefaultDueDays(type.defaultDueDays != null ? String(type.defaultDueDays) : "");
    setStageId(type.stageId || "none");
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    const dueDays = defaultDueDays.trim() === "" ? undefined : parseInt(defaultDueDays, 10);
    if (defaultDueDays.trim() !== "" && (isNaN(dueDays!) || dueDays! < 0)) {
      toast.error("Default due days must be a non-negative number");
      return;
    }

    const resolvedStageId = stageId === "none" ? null : stageId;

    setIsSubmitting(true);
    try {
      if (editingType) {
        const result = await updateCustomTaskType(editingType.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          defaultDueDays: dueDays ?? null,
          stageId: resolvedStageId,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Task type updated");
      } else {
        const result = await createCustomTaskType({
          name: name.trim(),
          description: description.trim() || undefined,
          defaultDueDays: dueDays,
          stageId: resolvedStageId,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Task type created");
      }
      setShowDialog(false);
      resetForm();
      router.refresh();
    } catch {
      toast.error("Failed to save task type");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (type: CustomTaskTypeRecord) => {
    setDeletingType(type);
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!deletingType) return;

    setIsSubmitting(true);
    try {
      const result = await deleteCustomTaskType(deletingType.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Task type deleted");
      setShowDeleteDialog(false);
      setDeletingType(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete task type");
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayTypes = initialTypes;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <ListTodo className="w-5 h-5" />
                Task Types
              </CardTitle>
              <CardDescription>
                Define task types and link them to stages
              </CardDescription>
            </div>
            <Button onClick={openCreate} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Task Type
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {displayTypes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ListTodo className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No task types yet.</p>
              <p className="text-sm">Add your first task type to get started.</p>
              <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
                <Plus className="w-4 h-4" />
                Add Task Type
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {displayTypes.map((type) => (
                <div
                  key={type.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <ListTodo className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{type.name}</p>
                        {type.isSystem && (
                          <Badge variant="secondary" className="text-xs">
                            System
                          </Badge>
                        )}
                        {type.stage && (
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 px-1.5"
                            style={{ borderColor: type.stage.color, color: type.stage.color }}
                          >
                            {type.stage.name}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {type.description && (
                          <span className="truncate">{type.description}</span>
                        )}
                        {type.defaultDueDays != null && (
                          <>
                            {type.description && <span>·</span>}
                            <span>Due in {type.defaultDueDays} days</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(type)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    {!type.isSystem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDeleteClick(type)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                className="w-full mt-2 gap-2"
                onClick={openCreate}
              >
                <Plus className="w-4 h-4" />
                Add Task Type
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingType ? "Edit Task Type" : "Add Task Type"}
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? "Update the task type details below"
                : "Create a new task type for your workflow"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Follow Up Call"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this task type"
              />
            </div>
            <div className="space-y-2">
              <Label>Link to Stage</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (General)</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                          style={{ backgroundColor: s.color }}
                        />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                When a contact enters this stage, this task type becomes available
              </p>
            </div>
            <div className="space-y-2">
              <Label>Default Due Days (optional)</Label>
              <Input
                type="number"
                min={0}
                value={defaultDueDays}
                onChange={(e) => setDefaultDueDays(e.target.value)}
                placeholder="e.g., 7"
              />
              <p className="text-xs text-muted-foreground">
                Number of days from creation until the task is due
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editingType ? (
                "Save Changes"
              ) : (
                "Add Task Type"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingType?.name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
