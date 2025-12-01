import Link from "next/link";
import { getContacts } from "@/lib/actions/contacts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, Search, Users, Clock, AlertCircle } from "lucide-react";
import { formatDistanceToNow, isPast, isToday } from "date-fns";

export const metadata = {
  title: "Contacts",
};

export default async function ContactsPage() {
  const { data: contacts, error } = await getContacts();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground mt-1">
            Manage your leads and customers
          </p>
        </div>
        <Link href="/contacts/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Contact
          </Button>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search contacts..." className="pl-10" />
        </div>
      </div>

      {/* Contacts List */}
      {error ? (
        <Card className="p-8">
          <div className="text-center text-destructive">
            <p>{error}</p>
          </div>
        </Card>
      ) : contacts.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No contacts yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Add your first contact to start tracking leads and automating follow-ups.
            </p>
            <Link href="/contacts/new">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Your First Contact
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => {
            const fullName = `${contact.firstName} ${contact.lastName}`;
            const initials = `${contact.firstName[0]}${contact.lastName[0]}`.toUpperCase();
            const nextTask = contact.tasks[0];
            const isOverdue = nextTask && isPast(new Date(nextTask.dueDate)) && !isToday(new Date(nextTask.dueDate));

            return (
              <Link key={contact.id} href={`/contacts/${contact.id}`}>
                <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-12 h-12 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{fullName}</p>
                        {contact.stage && (
                          <Badge
                            style={{ backgroundColor: contact.stage.color }}
                            className="text-white text-xs"
                          >
                            {contact.stage.name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {contact.email || contact.phone || "No contact info"}
                      </p>
                    </div>

                    <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
                      {nextTask && (
                        <div className={`flex items-center gap-1 ${isOverdue ? "text-destructive" : ""}`}>
                          {isOverdue ? (
                            <AlertCircle className="w-4 h-4" />
                          ) : (
                            <Clock className="w-4 h-4" />
                          )}
                          <span className="truncate max-w-[150px]">
                            {nextTask.title.split(" - ")[1] || nextTask.title}
                          </span>
                        </div>
                      )}
                      <span className="shrink-0">
                        {formatDistanceToNow(new Date(contact.updatedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
