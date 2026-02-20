"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { toast } from "sonner";
import {
  createCustomAppointmentType,
  updateCustomAppointmentType,
  deleteCustomAppointmentType,
} from "@/lib/actions/custom-types";
import { Plus, Pencil, Trash2, Loader2, Calendar } from "lucide-react";

interface AppointmentType {
  id: string;
  name: string;
  includesLocation: boolean;
  isSystem: boolean;
}

interface AppointmentTypeSettingsProps {
  initialTypes: AppointmentType[];
}

export function AppointmentTypeSettings({ initialTypes }: AppointmentTypeSettingsProps) {
  const router = useRouter();
  const [showDialog, setShowDialog] = useState(false);
  const [editingType, setEditingType] = useState<AppointmentType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [name, setName] = useState("");
  const [includesLocation, setIncludesLocation] = useState(true);

  const resetForm = () => {
    setName("");
    setIncludesLocation(true);
    setEditingType(null);
  };

  const openCreate = () => {
    resetForm();
    setShowDialog(true);
  };

  const openEdit = (t: AppointmentType) => {
    if (t.isSystem) return;
    setEditingType(t);
    setName(t.name);
    setIncludesLocation(t.includesLocation);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = editingType
        ? await updateCustomAppointmentType(editingType.id, {
            name: name.trim(),
            includesLocation,
          })
        : await createCustomAppointmentType({
            name: name.trim(),
            includesLocation,
          });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(editingType ? "Appointment type updated" : "Appointment type added");
      setShowDialog(false);
      resetForm();
      router.refresh();
    } catch {
      toast.error("Failed to save appointment type");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;

    setIsDeleting(true);
    try {
      const result = await deleteCustomAppointmentType(deletingId);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Appointment type deleted");
      setDeletingId(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete appointment type");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Appointment Types
              </CardTitle>
              <CardDescription>
                Define the appointment types available for scheduling
              </CardDescription>
            </div>
            <Button onClick={openCreate} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Appointment Type
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {initialTypes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No appointment types yet.</p>
              <p className="text-sm">Add your first appointment type to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {initialTypes.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <p className="font-medium">{t.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {t.isSystem && (
                          <Badge variant="secondary" className="text-xs">
                            System
                          </Badge>
                        )}
                        <span>
                          {t.includesLocation ? "Includes location" : "No location"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!t.isSystem && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(t)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDelete(t.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingType ? "Edit Appointment Type" : "Add Appointment Type"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Initial Inspection"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Includes Location</Label>
                <p className="text-xs text-muted-foreground">
                  Whether this appointment type requires a location
                </p>
              </div>
              <Switch checked={includesLocation} onCheckedChange={setIncludesLocation} />
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
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {editingType ? "Save Changes" : "Add Appointment Type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete appointment type?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Existing appointments using this type will keep their data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
