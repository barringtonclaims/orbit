"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImportDialog } from "@/components/contacts/import-dialog";
import { Plus, Search, Users, Clock, AlertCircle, ArrowUpDown } from "lucide-react";
import { formatDistanceToNow, isPast, isToday } from "date-fns";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
  stage: {
    id: string;
    name: string;
    color: string;
    stageType: string;
    workflowType: string;
  } | null;
  tasks: {
    id: string;
    title: string;
    dueDate: Date;
    status: string;
  }[];
  assignedTo: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  } | null;
  _count: {
    timeline: number;
    files: number;
  };
}

interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
  isTerminal: boolean;
}

interface ContactsViewProps {
  contacts: Contact[];
  stages: Stage[];
  initialSearch: string;
  initialStage: string;
  initialSort: string;
}

type SortOption = "updatedAt" | "createdAt" | "name" | "stage";

export function ContactsView({
  contacts,
  stages,
  initialSearch,
  initialStage,
  initialSort,
}: ContactsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [stageFilter, setStageFilter] = useState(initialStage);
  const [sort, setSort] = useState<SortOption>((initialSort as SortOption) || "updatedAt");

  // Stage counts
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: contacts.length };
    contacts.forEach((c) => {
      const key = c.stage?.id || "none";
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [contacts]);

  // Client-side filtering and sorting
  const filtered = useMemo(() => {
    let result = [...contacts];

    // Filter by search (client-side supplement to server-side)
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q)
      );
    }

    // Filter by stage
    if (stageFilter === "none") {
      result = result.filter((c) => !c.stage);
    } else if (stageFilter) {
      result = result.filter((c) => c.stage?.id === stageFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (sort) {
        case "name":
          return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        case "createdAt":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "stage":
          return (a.stage?.name || "ZZZ").localeCompare(b.stage?.name || "ZZZ");
        case "updatedAt":
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return result;
  }, [contacts, search, stageFilter, sort]);

  // Server-side search (debounced URL update)
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (search) params.set("search", search);
    else params.delete("search");
    router.push(`/contacts?${params.toString()}`);
  };

  const handleStageFilter = (value: string) => {
    const newStage = value === "all" ? "" : value;
    setStageFilter(newStage);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Contacts</h1>
          <p className="text-muted-foreground mt-1">
            {contacts.length} total contact{contacts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportDialog />
          <Link href="/contacts/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Contact
            </Button>
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <Select value={stageFilter || "all"} onValueChange={handleStageFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses ({stageCounts.all})</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name} ({stageCounts[s.id] || 0})
                </div>
              </SelectItem>
            ))}
            {(stageCounts["none"] || 0) > 0 && (
              <SelectItem value="none">No Status ({stageCounts["none"]})</SelectItem>
            )}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
          <SelectTrigger className="w-[180px]">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updatedAt">Last Modified</SelectItem>
            <SelectItem value="createdAt">Date Created</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="stage">Stage</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stage Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={!stageFilter ? "default" : "outline"}
          size="sm"
          onClick={() => setStageFilter("")}
          className="gap-1"
        >
          All
          <Badge variant="secondary" className="ml-1 text-xs">{stageCounts.all}</Badge>
        </Button>
        {stages.filter(s => !s.isTerminal).map((s) => (
          <Button
            key={s.id}
            variant={stageFilter === s.id ? "default" : "outline"}
            size="sm"
            onClick={() => setStageFilter(stageFilter === s.id ? "" : s.id)}
            className="gap-1"
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
            <Badge variant="secondary" className="ml-1 text-xs">{stageCounts[s.id] || 0}</Badge>
          </Button>
        ))}
      </div>

      {/* Contacts List */}
      {filtered.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {contacts.length === 0 ? "No contacts yet" : "No contacts match your filters"}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {contacts.length === 0
                ? "Add your first contact or import a CSV to get started."
                : "Try adjusting your search or filter criteria."}
            </p>
            {contacts.length === 0 && (
              <div className="flex items-center justify-center gap-3">
                <ImportDialog />
                <Link href="/contacts/new">
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Contact
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((contact) => {
            const fullName = `${contact.firstName} ${contact.lastName}`;
            const initials = `${contact.firstName[0] || "?"}${contact.lastName[0] || ""}`.toUpperCase();
            const nextTask = contact.tasks?.[0];
            const isOverdue = nextTask && isPast(new Date(nextTask.dueDate)) && !isToday(new Date(nextTask.dueDate));

            return (
              <Link key={contact.id} href={`/contacts/${contact.id}`}>
                <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-11 h-11 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
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
                      <span className="shrink-0 text-xs">
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
