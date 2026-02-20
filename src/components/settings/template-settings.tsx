"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { createTemplate, updateTemplate, deleteTemplate } from "@/lib/actions/templates";
import { TEMPLATE_VARIABLES } from "@/lib/templates";
import type { MessageTemplate } from "@prisma/client";
import { 
  FileText, 
  Plus, 
  Edit2, 
  Trash2, 
  MessageSquare, 
  Mail,
  Star,
  Loader2,
} from "lucide-react";

interface TaskTypeOption {
  id: string;
  name: string;
  stageId: string | null;
  stage?: { id: string; name: string; color: string } | null;
}

interface TemplateSettingsProps {
  templates: MessageTemplate[];
  taskTypes: TaskTypeOption[];
}

const ALL_VARIABLES: (keyof typeof TEMPLATE_VARIABLES)[] = [
  "first_name", "last_name", "full_name", "address", "city", "state",
  "carrier", "claim_number", "policy_number", "date_of_loss", "quote_type",
  "user_name", "user_email", "user_phone", "today", "appointment_date",
];

export function TemplateSettings({ templates, taskTypes }: TemplateSettingsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<MessageTemplate | null>(null);
  const [filterTaskType, setFilterTaskType] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [formData, setFormData] = useState({
    name: "",
    subject: "",
    body: "",
    templateType: "SMS" as "SMS" | "EMAIL",
    taskTypeName: "General",
    isDefault: false,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      subject: "",
      body: "",
      templateType: "SMS",
      taskTypeName: "General",
      isDefault: false,
    });
  };

  const handleOpenCreate = () => {
    resetForm();
    setEditingTemplate(null);
    setShowCreateDialog(true);
  };

  const handleOpenEdit = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      subject: template.subject || "",
      body: template.body,
      templateType: template.templateType as "SMS" | "EMAIL",
      taskTypeName: template.taskTypeName || "General",
      isDefault: template.isDefault,
    });
    setShowCreateDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.body.trim()) {
      toast.error("Name and body are required");
      return;
    }

    setIsLoading(true);
    try {
      const isGeneral = formData.taskTypeName === "General";
      const linkedType = taskTypes.find((t) => t.name === formData.taskTypeName);

      const payload = {
        name: formData.name,
        subject: formData.subject,
        body: formData.body,
        templateType: formData.templateType,
        category: isGeneral ? "General" : formData.taskTypeName,
        taskTypeName: isGeneral ? null : formData.taskTypeName,
        stageName: isGeneral ? null : (linkedType?.stage?.name || null),
        isDefault: formData.isDefault,
      };

      if (editingTemplate) {
        const result = await updateTemplate(editingTemplate.id, payload);
        if (result.error) { toast.error(result.error); return; }
        toast.success("Template updated");
      } else {
        const result = await createTemplate(payload);
        if (result.error) { toast.error(result.error); return; }
        toast.success("Template created");
      }
      
      setShowCreateDialog(false);
      resetForm();
      router.refresh();
    } catch {
      toast.error("Failed to save template");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTemplate) return;

    setIsLoading(true);
    try {
      const result = await deleteTemplate(deletingTemplate.id);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Template deleted");
      setShowDeleteDialog(false);
      setDeletingTemplate(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setIsLoading(false);
    }
  };

  const insertVariable = (variable: string) => {
    const variableText = `{{${variable}}}`;
    const textarea = bodyTextareaRef.current;
    
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentBody = formData.body;
      const newBody = currentBody.substring(0, start) + variableText + currentBody.substring(end);
      
      setFormData(prev => ({ ...prev, body: newBody }));
      
      setTimeout(() => {
        textarea.focus();
        const newPosition = start + variableText.length;
        textarea.setSelectionRange(newPosition, newPosition);
      }, 0);
    } else {
      setFormData(prev => ({ ...prev, body: prev.body + variableText }));
    }
  };

  const getTemplateGroup = (template: MessageTemplate): string => {
    return template.taskTypeName || "General";
  };

  const filteredTemplates = templates.filter(t => {
    const group = getTemplateGroup(t);
    if (filterTaskType !== "all" && group !== filterTaskType) return false;
    if (filterType !== "all" && t.templateType !== filterType) return false;
    return true;
  });

  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const group = getTemplateGroup(template);
    if (!acc[group]) acc[group] = [];
    acc[group].push(template);
    return acc;
  }, {} as Record<string, MessageTemplate[]>);

  const getTaskTypeColor = (taskTypeName: string): string => {
    if (taskTypeName === "General") return "#6b7280";
    const tt = taskTypes.find((t) => t.name === taskTypeName);
    return tt?.stage?.color || "#6b7280";
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Message Templates
              </CardTitle>
              <CardDescription>
                Create templates linked to task types. Josh AI uses these to match your voice when composing messages.
              </CardDescription>
            </div>
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              New Template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4">
            <Select value={filterTaskType} onValueChange={setFilterTaskType}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Task Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Task Types</SelectItem>
                <SelectItem value="General">General</SelectItem>
                {taskTypes.map(tt => (
                  <SelectItem key={tt.id} value={tt.name}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: tt.stage?.color || "#6b7280" }}
                      />
                      {tt.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Templates List */}
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No templates found</p>
              <Button onClick={handleOpenCreate} variant="outline" className="mt-4">
                Create your first template
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedTemplates).map(([groupName, groupTemplates]) => (
                <div key={groupName}>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: getTaskTypeColor(groupName) }}
                    />
                    {groupName}
                    {groupName !== "General" && (() => {
                      const tt = taskTypes.find(t => t.name === groupName);
                      if (tt?.stage) {
                        return (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 ml-1" style={{ borderColor: tt.stage.color, color: tt.stage.color }}>
                            {tt.stage.name}
                          </Badge>
                        );
                      }
                      return null;
                    })()}
                  </h3>
                  <div className="space-y-2">
                    {groupTemplates.map(template => (
                      <div
                        key={template.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {template.templateType === "SMS" ? (
                            <MessageSquare className="w-5 h-5 text-green-600 shrink-0" />
                          ) : (
                            <Mail className="w-5 h-5 text-blue-600 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{template.name}</p>
                              {template.isDefault && (
                                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {template.body.substring(0, 60)}...
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="hidden sm:flex">
                            {template.templateType}
                          </Badge>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(template)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setDeletingTemplate(template);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate 
                ? "Update the template details below" 
                : "Create a new message template. Link it to a task type so Josh AI knows when to use it."}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Template Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., First Contact SMS"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type *</Label>
                  <Select
                    value={formData.templateType}
                    onValueChange={(v: "SMS" | "EMAIL") => setFormData(prev => ({ ...prev, templateType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SMS">SMS</SelectItem>
                      <SelectItem value="EMAIL">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Link to Task Type</Label>
                <p className="text-xs text-muted-foreground">
                  Josh AI uses this template when composing messages for this task type.
                </p>
                <Select
                  value={formData.taskTypeName}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, taskTypeName: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block shrink-0 bg-gray-400" />
                        General (All Task Types)
                      </span>
                    </SelectItem>
                    {taskTypes.map(tt => (
                      <SelectItem key={tt.id} value={tt.name}>
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full inline-block shrink-0"
                            style={{ backgroundColor: tt.stage?.color || "#6b7280" }}
                          />
                          {tt.name}
                          {tt.stage && (
                            <span className="text-muted-foreground text-xs">({tt.stage.name})</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.templateType === "EMAIL" && (
                <div className="space-y-2">
                  <Label>Subject Line</Label>
                  <Input
                    value={formData.subject}
                    onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="e.g., Your Roof Quote - {{address}}"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Message Body *</Label>
                <Textarea
                  ref={bodyTextareaRef}
                  value={formData.body}
                  onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                  placeholder="Type your message here. Use {{variable}} for dynamic content."
                  rows={8}
                />
              </div>

              {/* Variable Insert */}
              <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                <div>
                  <Label className="text-sm font-medium">
                    Insert Variables
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click a variable to insert it at your cursor position.
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {ALL_VARIABLES.map(v => (
                    <Button
                      key={v}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs font-mono"
                      onClick={() => insertVariable(v)}
                      title={TEMPLATE_VARIABLES[v]}
                    >
                      {`{{${v}}}`}
                    </Button>
                  ))}
                </div>

                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
                    View all available variables
                  </summary>
                  <div className="mt-3 border rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-2 font-medium">Variable</th>
                          <th className="text-left p-2 font-medium">Description</th>
                          <th className="w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {Object.entries(TEMPLATE_VARIABLES).map(([key, desc]) => (
                          <tr key={key} className="hover:bg-muted/50">
                            <td className="p-2">
                              <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono text-xs">
                                {`{{${key}}}`}
                              </code>
                            </td>
                            <td className="p-2 text-muted-foreground">{desc}</td>
                            <td className="p-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => insertVariable(key)}
                              >
                                Insert
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                  className="rounded"
                />
                <Label htmlFor="isDefault" className="text-sm">
                  Set as default template for this task type
                </Label>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editingTemplate ? (
                "Save Changes"
              ) : (
                "Create Template"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingTemplate?.name}&quot;? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
