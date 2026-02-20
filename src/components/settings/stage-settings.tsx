"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { createLeadStage, updateLeadStage, deleteLeadStage, reorderLeadStages } from "@/lib/actions/stages";
import { Loader2, Layers, Plus, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";

interface Stage {
  id: string;
  name: string;
  color: string;
  description: string | null;
  order: number;
  isTerminal: boolean;
  stageType: string;
  workflowType: string;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#ef4444",
  "#f97316", "#f59e0b", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#6b7280",
];

interface StageSettingsProps {
  initialStages: Stage[];
}

export function StageSettings({ initialStages }: StageSettingsProps) {
  const router = useRouter();
  const [stages, setStages] = useState(initialStages);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [deletingStage, setDeletingStage] = useState<Stage | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState("#6366f1");
  const [formDescription, setFormDescription] = useState("");
  const [formStageType, setFormStageType] = useState<"ACTIVE" | "APPROVED" | "SEASONAL" | "NOT_INTERESTED">("ACTIVE");

  function openCreate() {
    setFormName("");
    setFormColor("#6366f1");
    setFormDescription("");
    setFormStageType("ACTIVE");
    setEditingStage(null);
    setShowCreateDialog(true);
  }

  function openEdit(stage: Stage) {
    setFormName(stage.name);
    setFormColor(stage.color);
    setFormDescription(stage.description || "");
    setFormStageType(stage.stageType as "ACTIVE" | "APPROVED" | "SEASONAL" | "NOT_INTERESTED");
    setEditingStage(stage);
    setShowCreateDialog(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error("Name is required");
      return;
    }
    setIsSaving(true);
    try {
      if (editingStage) {
        const result = await updateLeadStage(editingStage.id, {
          name: formName,
          color: formColor,
          description: formDescription || undefined,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setStages((prev) =>
          prev.map((s) =>
            s.id === editingStage.id
              ? { ...s, name: formName, color: formColor, description: formDescription || null }
              : s
          )
        );
        toast.success("Stage updated");
      } else {
        const result = await createLeadStage({
          name: formName,
          color: formColor,
          description: formDescription || undefined,
          stageType: formStageType,
          isTerminal: formStageType !== "ACTIVE",
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        if (result.data) {
          setStages((prev) => [...prev, result.data as Stage]);
        }
        toast.success("Stage created");
      }
      setShowCreateDialog(false);
      router.refresh();
    } catch {
      toast.error("Failed to save stage");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingStage) return;
    setIsSaving(true);
    try {
      const result = await deleteLeadStage(deletingStage.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setStages((prev) => prev.filter((s) => s.id !== deletingStage.id));
      toast.success("Stage deleted");
      setDeletingStage(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete stage");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMove(index: number, direction: "up" | "down") {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= stages.length) return;

    const reordered = [...stages];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    reordered.forEach((s, i) => (s.order = i));
    setStages(reordered);

    const result = await reorderLeadStages(reordered.map((s) => s.id));
    if (result.error) {
      toast.error(result.error);
      setStages(stages);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Lead Stages
              </CardTitle>
              <CardDescription>
                Define and order the workflow stages contacts move through
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Add Stage
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {stages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No stages defined yet.
            </p>
          ) : (
            stages.map((stage, index) => (
              <div
                key={stage.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleMove(index, "up")}
                      disabled={index === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-default transition-colors"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, "down")}
                      disabled={index === stages.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-default transition-colors"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div
                    className="w-3.5 h-3.5 rounded-full ring-2 ring-offset-2 ring-offset-background shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <div>
                    <span className="text-sm font-medium">{stage.name}</span>
                    {stage.description && (
                      <span className="text-xs text-muted-foreground ml-2">{stage.description}</span>
                    )}
                  </div>
                  {stage.isTerminal && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      Terminal
                    </Badge>
                  )}
                  {stage.stageType !== "ACTIVE" && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                      {stage.stageType.toLowerCase().replace("_", " ")}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(stage)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeletingStage(stage)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStage ? "Edit Stage" : "Add Stage"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Retail Prospect" />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Brief description" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="w-7 h-7 rounded-full transition-all ring-offset-2 ring-offset-background"
                    style={{
                      backgroundColor: c,
                      boxShadow: formColor === c ? `0 0 0 2px var(--background), 0 0 0 4px ${c}` : "none",
                    }}
                    onClick={() => setFormColor(c)}
                  />
                ))}
              </div>
            </div>
            {!editingStage && (
              <div className="space-y-2">
                <Label>Stage Type</Label>
                <Select value={formStageType} onValueChange={(v) => setFormStageType(v as typeof formStageType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="APPROVED">Approved / Won</SelectItem>
                    <SelectItem value="SEASONAL">Seasonal Follow Up</SelectItem>
                    <SelectItem value="NOT_INTERESTED">Not Interested</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingStage ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingStage} onOpenChange={(open) => !open && setDeletingStage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deletingStage?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This stage will be permanently removed. Contacts currently in this stage must be moved first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isSaving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
