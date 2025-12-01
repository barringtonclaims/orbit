"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from "@/lib/actions/templates";
import { Plus, MessageSquare, Mail, Edit, Trash2, Loader2, Star } from "lucide-react";

interface Template {
  id: string;
  name: string;
  body: string;
  templateType: "SMS" | "EMAIL";
  category: string | null;
  isDefault: boolean;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    body: "",
    templateType: "SMS" as "SMS" | "EMAIL",
    category: "",
    isDefault: false,
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setIsLoading(true);
    const { data, error } = await getTemplates();
    if (data) {
      setTemplates(data);
    }
    if (error) {
      toast.error(error);
    }
    setIsLoading(false);
  }

  const openCreateDialog = (type: "SMS" | "EMAIL") => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      body: "",
      templateType: type,
      category: "",
      isDefault: false,
    });
    setShowDialog(true);
  };

  const openEditDialog = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      body: template.body,
      templateType: template.templateType,
      category: template.category || "",
      isDefault: template.isDefault,
    });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.body.trim()) {
      toast.error("Name and body are required");
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingTemplate) {
        const result = await updateTemplate(editingTemplate.id, {
          name: formData.name,
          body: formData.body,
          category: formData.category || undefined,
          isDefault: formData.isDefault,
        });

        if (result.error) {
          toast.error(result.error);
          return;
        }

        toast.success("Template updated");
      } else {
        const result = await createTemplate({
          name: formData.name,
          body: formData.body,
          templateType: formData.templateType,
          category: formData.category || undefined,
          isDefault: formData.isDefault,
        });

        if (result.error) {
          toast.error(result.error);
          return;
        }

        toast.success("Template created");
      }

      setShowDialog(false);
      loadTemplates();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) {
      return;
    }

    try {
      const result = await deleteTemplate(id);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Template deleted");
      loadTemplates();
    } catch {
      toast.error("Failed to delete template");
    }
  };

  const smsTemplates = templates.filter((t) => t.templateType === "SMS");
  const emailTemplates = templates.filter((t) => t.templateType === "EMAIL");

  const TemplateCard = ({ template }: { template: Template }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {template.templateType === "SMS" ? (
              <MessageSquare className="w-4 h-4 text-primary" />
            ) : (
              <Mail className="w-4 h-4 text-primary" />
            )}
            <CardTitle className="text-base">{template.name}</CardTitle>
            {template.isDefault && (
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            )}
          </div>
          {template.category && (
            <Badge variant="outline">{template.category}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3 mb-4">
          {template.body}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => openEditDialog(template)}
          >
            <Edit className="w-3 h-3" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-destructive hover:text-destructive"
            onClick={() => handleDelete(template.id)}
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Message Templates</h1>
          <p className="text-muted-foreground mt-1">
            Reusable SMS and email templates for quick follow-ups
          </p>
        </div>
      </div>

      {/* Variable Help */}
      <Card className="bg-muted/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Available Variables</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              "{customer_name}",
              "{user_name}",
              "{company_name}",
              "{date}",
              "{time}",
              "{address}",
            ].map((variable) => (
              <code
                key={variable}
                className="px-2 py-1 bg-background rounded text-xs font-mono"
              >
                {variable}
              </code>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Template Tabs */}
      <Tabs defaultValue="sms" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="sms" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              SMS Templates
              <Badge variant="secondary" className="ml-1">
                {smsTemplates.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="w-4 h-4" />
              Email Templates
              <Badge variant="secondary" className="ml-1">
                {emailTemplates.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sms" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openCreateDialog("SMS")} className="gap-2">
              <Plus className="w-4 h-4" />
              New SMS Template
            </Button>
          </div>
          
          {smsTemplates.length === 0 ? (
            <Card className="p-12">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No SMS templates yet</p>
                <Button onClick={() => openCreateDialog("SMS")} className="mt-4 gap-2">
                  <Plus className="w-4 h-4" />
                  Create Your First Template
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {smsTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="email" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openCreateDialog("EMAIL")} className="gap-2">
              <Plus className="w-4 h-4" />
              New Email Template
            </Button>
          </div>
          
          {emailTemplates.length === 0 ? (
            <Card className="p-12">
              <div className="text-center">
                <Mail className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No email templates yet</p>
                <Button onClick={() => openCreateDialog("EMAIL")} className="mt-4 gap-2">
                  <Plus className="w-4 h-4" />
                  Create Your First Template
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {emailTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : `New ${formData.templateType} Template`}
            </DialogTitle>
            <DialogDescription>
              Create reusable message templates for quick follow-ups
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., First Contact"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category (optional)</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="First Contact">First Contact</SelectItem>
                  <SelectItem value="Follow Up">Follow Up</SelectItem>
                  <SelectItem value="Quote">Quote</SelectItem>
                  <SelectItem value="Appointment">Appointment</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Message Body</Label>
              <Textarea
                id="body"
                value={formData.body}
                onChange={(e) => setFormData((prev) => ({ ...prev, body: e.target.value }))}
                placeholder="Type your message template..."
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Use variables like {"{customer_name}"} to personalize messages
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="default">Set as default</Label>
                <p className="text-xs text-muted-foreground">
                  Auto-select this template when composing
                </p>
              </div>
              <Switch
                id="default"
                checked={formData.isDefault}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, isDefault: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
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
    </div>
  );
}
