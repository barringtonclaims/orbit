"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { addNote } from "@/lib/actions/contacts";
import { formatDistanceToNow, format } from "date-fns";
import { 
  Send, 
  Loader2,
  MessageSquare,
  Mail,
  Phone,
  CheckCircle2,
  Calendar,
  FileUp,
  ArrowRight,
  Bot
} from "lucide-react";

interface TimelineNote {
  id: string;
  content: string;
  noteType: string;
  createdAt: Date;
  user: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

interface ContactTimelineProps {
  contactId: string;
  timeline: TimelineNote[];
}

const noteTypeIcons: Record<string, React.ReactNode> = {
  NOTE: <MessageSquare className="w-4 h-4" />,
  EMAIL_SENT: <Mail className="w-4 h-4" />,
  SMS_SENT: <Phone className="w-4 h-4" />,
  TASK_COMPLETED: <CheckCircle2 className="w-4 h-4" />,
  APPOINTMENT_SCHEDULED: <Calendar className="w-4 h-4" />,
  FILE_UPLOADED: <FileUp className="w-4 h-4" />,
  STAGE_CHANGE: <ArrowRight className="w-4 h-4" />,
  SYSTEM: <Bot className="w-4 h-4" />,
};

const noteTypeLabels: Record<string, string> = {
  NOTE: "Note",
  EMAIL_SENT: "Email Sent",
  SMS_SENT: "SMS Sent",
  TASK_COMPLETED: "Task Completed",
  APPOINTMENT_SCHEDULED: "Appointment Scheduled",
  FILE_UPLOADED: "File Uploaded",
  STAGE_CHANGE: "Stage Changed",
  SYSTEM: "System",
};

export function ContactTimeline({ contactId, timeline }: ContactTimelineProps) {
  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    setIsSubmitting(true);

    try {
      const result = await addNote(contactId, newNote.trim());

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setNewNote("");
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Note Form */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-3">
            <Textarea
              placeholder="Add a note about this contact..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              disabled={isSubmitting}
            />
            <div className="flex justify-end">
              <Button 
                onClick={handleAddNote} 
                disabled={!newNote.trim() || isSubmitting}
                size="sm"
                className="gap-2"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Add Note
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline List */}
      {timeline.length === 0 ? (
        <Card className="p-8">
          <div className="text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No timeline entries yet</p>
            <p className="text-sm text-muted-foreground/75">
              Add notes to track your interactions with this contact
            </p>
          </div>
        </Card>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-4 pr-4">
            {timeline.map((entry, index) => (
              <div key={entry.id} className="flex gap-4">
                {/* Timeline Line */}
                <div className="flex flex-col items-center">
                  <Avatar className="w-8 h-8 shrink-0">
                    {entry.noteType === "SYSTEM" ? (
                      <AvatarFallback className="bg-muted">
                        <Bot className="w-4 h-4" />
                      </AvatarFallback>
                    ) : (
                      <>
                        <AvatarImage src={entry.user.avatarUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {entry.user.fullName.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </>
                    )}
                  </Avatar>
                  {index < timeline.length - 1 && (
                    <div className="w-px h-full bg-border mt-2" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">
                      {entry.noteType === "SYSTEM" ? "System" : entry.user.fullName}
                    </span>
                    <Badge variant="secondary" className="gap-1 text-xs">
                      {noteTypeIcons[entry.noteType]}
                      {noteTypeLabels[entry.noteType] || entry.noteType}
                    </Badge>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{entry.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(entry.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    {" · "}
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}


