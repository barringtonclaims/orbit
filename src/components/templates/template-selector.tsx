"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquare, 
  Mail, 
  Sparkles, 
  Check,
  Copy,
  Edit2,
  Send,
} from "lucide-react";
import { parseTemplate, type TemplateContext, TEMPLATE_VARIABLES } from "@/lib/templates";
import { getTemplates } from "@/lib/actions/templates";
import type { MessageTemplate } from "@prisma/client";
import { toast } from "sonner";

interface TemplateSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: string;
  context: TemplateContext;
  onSelect: (message: string, type: "sms" | "email", subject?: string) => void;
  onUseAI?: () => void;
  preferredType?: "sms" | "email";
  title?: string;
}

export function TemplateSelector({
  open,
  onOpenChange,
  category,
  context,
  onSelect,
  onUseAI,
  preferredType = "sms",
  title = "Select Template",
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<"sms" | "email">(preferredType);
  const [editedMessage, setEditedMessage] = useState("");
  const [editedSubject, setEditedSubject] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preferredDate, setPreferredDate] = useState<string>("");
  
  // Ref for textarea to track cursor position
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Check if this is the first message category (needs date picker)
  const showDatePicker = category === "FIRST_MESSAGE";
  
  // Insert variable at cursor position
  const insertVariableAtCursor = (variable: string) => {
    const variableText = `{{${variable}}}`;
    const textarea = messageTextareaRef.current;
    
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      // Insert at cursor position (or replace selected text)
      const newMessage = editedMessage.substring(0, start) + variableText + editedMessage.substring(end);
      setEditedMessage(newMessage);
      
      // Set cursor position after the inserted variable
      setTimeout(() => {
        textarea.focus();
        const newPosition = start + variableText.length;
        textarea.setSelectionRange(newPosition, newPosition);
      }, 0);
    } else {
      // Fallback: append to end
      setEditedMessage(prev => prev + variableText);
    }
  };

  // Fetch templates when dialog opens
  useEffect(() => {
    if (open) {
      setLoading(true);
      getTemplates({ category }).then(({ data }) => {
        setTemplates(data || []);
        setLoading(false);
        
        // Auto-select default template
        const defaultTemplate = data?.find(
          t => t.isDefault && t.templateType === activeTab.toUpperCase()
        );
        if (defaultTemplate) {
          handleSelectTemplate(defaultTemplate);
        }
      });
    }
  }, [open, category]);

  // Filter templates by type
  const smsTemplates = templates.filter(t => t.templateType === "SMS");
  const emailTemplates = templates.filter(t => t.templateType === "EMAIL");

  // Get context with preferred date
  const getContextWithPreferredDate = () => {
    return {
      ...context,
      preferredDate: preferredDate ? new Date(preferredDate + "T12:00:00") : undefined,
    };
  };

  const handleSelectTemplate = (template: MessageTemplate) => {
    setSelectedTemplate(template);
    setIsEditing(false);
    
    // Parse template with context (including preferred date)
    const contextWithDate = getContextWithPreferredDate();
    const parsedBody = parseTemplate(template.body, contextWithDate);
    setEditedMessage(parsedBody);
    
    if (template.subject) {
      const parsedSubject = parseTemplate(template.subject, contextWithDate);
      setEditedSubject(parsedSubject);
    } else {
      setEditedSubject("");
    }
  };
  
  // Re-parse template when preferred date changes
  const handlePreferredDateChange = (date: string) => {
    setPreferredDate(date);
    if (selectedTemplate && !isEditing) {
      const contextWithDate = {
        ...context,
        preferredDate: date ? new Date(date + "T12:00:00") : undefined,
      };
      const parsedBody = parseTemplate(selectedTemplate.body, contextWithDate);
      setEditedMessage(parsedBody);
      
      if (selectedTemplate.subject) {
        const parsedSubject = parseTemplate(selectedTemplate.subject, contextWithDate);
        setEditedSubject(parsedSubject);
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedMessage);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleSend = () => {
    if (!editedMessage.trim()) {
      toast.error("Message cannot be empty");
      return;
    }
    
    onSelect(
      editedMessage,
      activeTab,
      activeTab === "email" ? editedSubject : undefined
    );
    onOpenChange(false);
  };

  const currentTemplates = activeTab === "sms" ? smsTemplates : emailTemplates;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {activeTab === "sms" ? (
              <MessageSquare className="h-5 w-5" />
            ) : (
              <Mail className="h-5 w-5" />
            )}
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* Preferred Inspection Date - Only for First Message */}
        {showDatePicker && (
          <div className="flex items-center gap-3 border rounded-lg px-3 py-2 bg-muted/30">
            <div className="flex-1">
              <Label className="text-sm font-medium">
                Preferred Inspection Date
              </Label>
              <p className="text-xs text-muted-foreground">
                Suggest a date for the inspection
              </p>
            </div>
            <Input
              type="date"
              value={preferredDate}
              onChange={(e) => handlePreferredDateChange(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-auto"
            />
          </div>
        )}

        <Tabs 
          value={activeTab} 
          onValueChange={(v) => {
            setActiveTab(v as "sms" | "email");
            setSelectedTemplate(null);
            setEditedMessage("");
            setEditedSubject("");
          }}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sms" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              SMS ({smsTemplates.length})
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" />
              Email ({emailTemplates.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 grid grid-cols-2 gap-4 mt-4 overflow-hidden">
            {/* Template List */}
            <div className="flex flex-col overflow-hidden">
              <Label className="text-sm text-muted-foreground mb-2">
                Templates
              </Label>
              <ScrollArea className="flex-1 border rounded-md">
                <div className="p-2 space-y-1">
                  {loading ? (
                    <div className="text-sm text-muted-foreground p-4 text-center">
                      Loading templates...
                    </div>
                  ) : currentTemplates.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-4 text-center">
                      No {activeTab.toUpperCase()} templates found.
                      <br />
                      Create templates in Settings.
                    </div>
                  ) : (
                    currentTemplates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleSelectTemplate(template)}
                        className={`w-full text-left p-3 rounded-md transition-colors ${
                          selectedTemplate?.id === template.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm truncate">
                            {template.name}
                          </span>
                          {template.isDefault && (
                            <Badge variant="secondary" className="text-xs ml-2">
                              Default
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs opacity-70 mt-1 line-clamp-2">
                          {template.body.substring(0, 80)}...
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>

              {onUseAI && (
                <Button
                  variant="outline"
                  className="mt-2 gap-2"
                  onClick={() => {
                    onUseAI();
                    onOpenChange(false);
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  Use AI to Generate
                </Button>
              )}
            </div>

            {/* Preview/Edit */}
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm text-muted-foreground">
                  {isEditing ? "Edit Message" : "Preview"}
                </Label>
                {selectedTemplate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                    className="h-7 gap-1"
                  >
                    <Edit2 className="h-3 w-3" />
                    {isEditing ? "Preview" : "Edit"}
                  </Button>
                )}
              </div>

              {activeTab === "email" && selectedTemplate && (
                <div className="mb-2">
                  <Label className="text-xs text-muted-foreground">Subject</Label>
                  {isEditing ? (
                    <Input
                      value={editedSubject}
                      onChange={(e) => setEditedSubject(e.target.value)}
                      placeholder="Email subject..."
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-sm p-2 bg-muted rounded-md mt-1">
                      {editedSubject || "(No subject)"}
                    </p>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-hidden">
                {selectedTemplate ? (
                  isEditing ? (
                    <Textarea
                      ref={messageTextareaRef}
                      value={editedMessage}
                      onChange={(e) => setEditedMessage(e.target.value)}
                      className="h-full resize-none"
                      placeholder="Type your message..."
                    />
                  ) : (
                    <ScrollArea className="h-full border rounded-md">
                      <div className="p-3 text-sm whitespace-pre-wrap">
                        {editedMessage}
                      </div>
                    </ScrollArea>
                  )
                ) : (
                  <div className="h-full border rounded-md flex items-center justify-center text-sm text-muted-foreground">
                    Select a template to preview
                  </div>
                )}
              </div>

              {/* Variable reference */}
              {isEditing && (
                <div className="mt-2 border rounded-md p-2 bg-muted/30">
                  <p className="text-xs font-medium mb-2">Click to insert at cursor:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(TEMPLATE_VARIABLES).map(([key, desc]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => insertVariableAtCursor(key)}
                        className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono hover:bg-primary/20 transition-colors"
                        title={desc}
                      >
                        {`{{${key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Tabs>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleCopy}
            disabled={!editedMessage}
            className="gap-2"
          >
            <Copy className="h-4 w-4" />
            Copy
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={!editedMessage}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {activeTab === "sms" ? "Open SMS" : "Open Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Simple hook for using templates
export function useTemplateSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<{
    category: string;
    context: TemplateContext;
    preferredType?: "sms" | "email";
    title?: string;
    onSelect: (message: string, type: "sms" | "email", subject?: string) => void;
  } | null>(null);

  const openSelector = (config: {
    category: string;
    context: TemplateContext;
    preferredType?: "sms" | "email";
    title?: string;
    onSelect: (message: string, type: "sms" | "email", subject?: string) => void;
  }) => {
    setConfig(config);
    setIsOpen(true);
  };

  const TemplateSelectorDialog = config ? (
    <TemplateSelector
      open={isOpen}
      onOpenChange={setIsOpen}
      category={config.category}
      context={config.context}
      preferredType={config.preferredType}
      title={config.title}
      onSelect={config.onSelect}
    />
  ) : null;

  return {
    openSelector,
    TemplateSelectorDialog,
  };
}

