"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getTemplates } from "@/lib/actions/templates";
import { fillTemplate } from "@/lib/utils";
import { addNote } from "@/lib/actions/contacts";
import { getNextInspectionDay } from "@/lib/scheduling";
import { format, getDay, isTomorrow } from "date-fns";
import { Send, MessageSquare, FileText, Check, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  body: string;
  category: string | null;
  isDefault: boolean;
}

interface SMSComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  userName?: string;
  companyName?: string;
  inspectionDays?: number[];
}

export function SMSComposer({
  open,
  onOpenChange,
  contact,
  userName = "Max",
  companyName = "Shake Guys",
  inspectionDays = [2, 4], // Default Tu/Th
}: SMSComposerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  // Initialize date on mount
  useEffect(() => {
    if (open && !selectedDate) {
      setSelectedDate(getNextInspectionDay(new Date(), inspectionDays));
    }
  }, [open, inspectionDays]);

  useEffect(() => {
    async function loadTemplates() {
      const { data } = await getTemplates("SMS");
      if (data) {
        setTemplates(data);
        // Auto-select default template
        const defaultTemplate = data.find(t => t.isDefault);
        if (defaultTemplate) {
          // We can't call handleSelectTemplate directly here easily due to closure/dep loop
          // So we replicate logic or use effect
          setSelectedTemplate(defaultTemplate);
        }
      }
    }
    if (open) {
      loadTemplates();
    }
  }, [open]);

  // Update message when template or date changes
  useEffect(() => {
    if (selectedTemplate) {
      const dateStr = selectedDate 
        ? (isTomorrow(selectedDate) ? "tomorrow" : format(selectedDate, "EEEE, MMMM do"))
        : "{date}";

      const filled = fillTemplate(selectedTemplate.body, {
        customer_name: contact.firstName,
        user_name: userName,
        company_name: companyName,
        date: dateStr,
        time: "{time}", // Time is usually negotiated
      });
      setMessage(filled);
    }
  }, [selectedTemplate, selectedDate, contact, userName, companyName]);

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    setIsLoading(true);

    try {
      // Log the SMS to the contact timeline
      await addNote(contact.id, `SMS sent: "${message}"`);
      
      // Open native SMS app with pre-composed message
      const encodedMessage = encodeURIComponent(message);
      window.location.href = `sms:${contact.phone}&body=${encodedMessage}`;
      
      toast.success("Opening Messages app...");
      onOpenChange(false);
      setMessage("");
      setSelectedTemplate(null);
    } catch {
      toast.error("Failed to prepare message");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Send Message to {contact.firstName}
          </DialogTitle>
          <DialogDescription>
            Choose a template and propose an inspection date.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            {/* Date Picker */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Proposed Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => {
                      // Disable past dates
                      if (date < new Date(new Date().setHours(0,0,0,0))) return true;
                      // Disable non-inspection days
                      return !inspectionDays.includes(getDay(date));
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground mt-1">
                Only showing Inspection Days
              </p>
            </div>

            {/* Template Selection */}
            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 block">Templates</Label>
              <ScrollArea className="h-[180px] rounded-md border p-2">
                <div className="space-y-2">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedTemplate?.id === template.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{template.name}</span>
                        {selectedTemplate?.id === template.id && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      {template.category && (
                        <Badge variant="secondary" className="text-xs">
                          {template.category}
                        </Badge>
                      )}
                    </button>
                  ))}
                  {templates.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No templates yet
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Message Editor */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="h-[280px] resize-none font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {message.length} characters
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isLoading || !message.trim()} className="gap-2">
            <Send className="w-4 h-4" />
            Send Message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
