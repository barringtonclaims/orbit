"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { deleteContact } from "@/lib/actions/contacts";
import { SMSComposer } from "@/components/messaging/sms-composer";
import { 
  MoreHorizontal, 
  MessageSquare, 
  Mail, 
  Phone, 
  Edit, 
  Trash2,
  Calendar,
  Send
} from "lucide-react";

interface ContactActionsProps {
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
  };
  defaultOpenSMS?: boolean;
  inspectionDays?: number[];
}

export function ContactActions({ contact, defaultOpenSMS = false, inspectionDays = [] }: ContactActionsProps) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSMSComposer, setShowSMSComposer] = useState(defaultOpenSMS);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCall = () => {
    if (!contact.phone) {
      toast.error("No phone number available");
      return;
    }
    window.location.href = `tel:${contact.phone}`;
  };

  const handleEmail = () => {
    if (!contact.email) {
      toast.error("No email address available");
      return;
    }
    window.location.href = `mailto:${contact.email}`;
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    
    try {
      const result = await deleteContact(contact.id);
      
      if (result.error) {
        toast.error(result.error);
        return;
      }
      
      toast.success("Contact deleted");
      router.push("/contacts");
    } catch {
      toast.error("Failed to delete contact");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Quick Actions */}
        {contact.phone && (
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowSMSComposer(true)}
              title="Send Message"
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleCall} title="Call">
              <Phone className="w-4 h-4" />
            </Button>
          </>
        )}
        
        {contact.email && (
          <Button variant="outline" size="icon" onClick={handleEmail} title="Send Email">
            <Mail className="w-4 h-4" />
          </Button>
        )}

        {/* More Actions Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => router.push(`/contacts/${contact.id}/edit`)}>
              <Edit className="w-4 h-4 mr-2" />
              Edit Contact
            </DropdownMenuItem>
            {contact.phone && (
              <DropdownMenuItem onClick={() => setShowSMSComposer(true)}>
                <Send className="w-4 h-4 mr-2" />
                Send Message
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Contact
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* SMS Composer */}
      {contact.phone && (
        <SMSComposer
          open={showSMSComposer}
          onOpenChange={setShowSMSComposer}
          contact={{
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            phone: contact.phone,
          }}
          inspectionDays={inspectionDays}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {contact.firstName} {contact.lastName}? 
              This will also delete all associated tasks, notes, and files. 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
