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
import { TEMPLATE_VARIABLES, getSuggestedVariables } from "@/lib/templates";
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

interface TemplateSettingsProps {
  templates: MessageTemplate[];
}

const TEMPLATE_CATEGORIES = [
  { value: "FIRST_MESSAGE", label: "First Message", stage: "New Lead" },
  { value: "FIRST_MESSAGE_FOLLOW_UP", label: "First Message Follow Up", stage: "New Lead" },
  { value: "APPOINTMENT_REMINDER", label: "Appointment Reminder", stage: "Scheduled Inspection" },
  { value: "QUOTE", label: "Quote", stage: "Retail Prospect" },
  { value: "QUOTE_FOLLOW_UP", label: "Quote Follow Up", stage: "Retail Prospect" },
  { value: "CLAIM_RECOMMENDATION", label: "Claim Recommendation", stage: "Claim Prospect" },
  { value: "CLAIM_REC_FOLLOW_UP", label: "Claim Rec Follow Up", stage: "Claim Prospect" },
  { value: "PA_AGREEMENT", label: "PA Agreement", stage: "Claim Prospect" },
  { value: "PA_FOLLOW_UP", label: "PA Agreement Follow Up", stage: "Claim Prospect" },
  { value: "CLAIM_FOLLOW_UP", label: "Claim Follow Up", stage: "Open Claim" },
  { value: "CARRIER_FOLLOW_UP", label: "Carrier Follow Up", stage: "Open Claim" },
  { value: "SEASONAL", label: "Seasonal Follow Up", stage: "Seasonal" },
  { value: "GENERAL", label: "General", stage: "" },
];

export function TemplateSettings({ templates }: TemplateSettingsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<MessageTemplate | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  
  // Ref for textarea to track cursor position
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  type TemplateCategory = "FIRST_MESSAGE" | "FIRST_MESSAGE_FOLLOW_UP" | "APPOINTMENT_REMINDER" | "QUOTE" | "QUOTE_FOLLOW_UP" | "CLAIM_RECOMMENDATION" | "CLAIM_REC_FOLLOW_UP" | "PA_AGREEMENT" | "PA_FOLLOW_UP" | "CLAIM_FOLLOW_UP" | "CARRIER_FOLLOW_UP" | "SEASONAL" | "GENERAL";
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    subject: "",
    body: "",
    templateType: "SMS" as "SMS" | "EMAIL",
    category: "GENERAL" as TemplateCategory,
    isDefault: false,
  });

  const resetForm = () => {
    setFormData({
      name: "",
      subject: "",
      body: "",
      templateType: "SMS",
      category: "GENERAL",
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
      category: template.category as TemplateCategory,
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
      if (editingTemplate) {
        const result = await updateTemplate(editingTemplate.id, formData);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Template updated");
      } else {
        const result = await createTemplate(formData);
        if (result.error) {
          toast.error(result.error);
          return;
        }
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
      if (result.error) {
        toast.error(result.error);
        return;
      }
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
      
      // Insert at cursor position (or replace selected text)
      const newBody = currentBody.substring(0, start) + variableText + currentBody.substring(end);
      
      setFormData(prev => ({
        ...prev,
        body: newBody,
      }));
      
      // Set cursor position after the inserted variable (after state update)
      setTimeout(() => {
        textarea.focus();
        const newPosition = start + variableText.length;
        textarea.setSelectionRange(newPosition, newPosition);
      }, 0);
    } else {
      // Fallback: append to end
      setFormData(prev => ({
        ...prev,
        body: prev.body + variableText,
      }));
    }
  };

  // Filter templates
  const filteredTemplates = templates.filter(t => {
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    if (filterType !== "all" && t.templateType !== filterType) return false;
    return true;
  });

  // Group by category
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const cat = template.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(template);
    return acc;
  }, {} as Record<string, MessageTemplate[]>);

  const suggestedVars = getSuggestedVariables(formData.category);

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
                Create and manage templates for SMS and email messages
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
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {TEMPLATE_CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
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
              {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                <div key={category}>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    {TEMPLATE_CATEGORIES.find(c => c.value === category)?.label || category}
                  </h3>
                  <div className="space-y-2">
                    {categoryTemplates.map(template => (
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(template)}
                          >
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
                : "Create a new message template"}
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
                <Label>Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v: TemplateCategory) => setFormData(prev => ({ ...prev, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
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
                    Click a variable to insert it at your cursor position. Variables use <code className="bg-muted px-1 rounded">{"{{variable}}"}</code> syntax.
                  </p>
                </div>
                
                {/* Suggested Variables for this category */}
                <div>
                  <p className="text-xs font-medium mb-2 text-muted-foreground">Suggested for this category:</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedVars.map(v => (
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
                </div>

                {/* All Variables Table */}
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
                    View all available variables →
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
                  Set as default template for this category
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

