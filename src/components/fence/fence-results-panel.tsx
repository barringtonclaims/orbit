"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MapPin,
  Phone,
  Mail,
  Users,
  ChevronRight,
  CheckSquare,
  Square,
} from "lucide-react";
import type { FenceContactResult } from "@/lib/actions/fences";

interface FenceResultsPanelProps {
  results: FenceContactResult[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  isLoading: boolean;
  fenceName: string | null;
}

export function FenceResultsPanel({
  results,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  isLoading,
  fenceName,
}: FenceResultsPanelProps) {
  const allSelected =
    results.length > 0 && results.every((r) => selectedIds.has(r.id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        <span className="ml-3 text-sm text-muted-foreground">
          Searching contacts...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {results.length} contact{results.length !== 1 ? "s" : ""}
          </span>
          {fenceName && (
            <span className="text-xs text-muted-foreground">
              in {fenceName}
            </span>
          )}
        </div>
        {results.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={allSelected ? onClearSelection : onSelectAll}
          >
            {allSelected ? (
              <>
                <Square className="w-3 h-3 mr-1" />
                Deselect
              </>
            ) : (
              <>
                <CheckSquare className="w-3 h-3 mr-1" />
                Select All
              </>
            )}
          </Button>
        )}
      </div>

      {/* Results List */}
      {results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
          <MapPin className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {fenceName
              ? "No contacts found in this area with the current filters."
              : "Draw a fence on the map or select a saved fence, then click Filter to search."}
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="divide-y">
            {results.map((contact) => (
              <div
                key={contact.id}
                className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={selectedIds.has(contact.id)}
                  onCheckedChange={() => onToggleSelect(contact.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="text-sm font-medium hover:underline truncate"
                    >
                      {contact.firstName} {contact.lastName}
                    </Link>
                    {contact.stage && (
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0"
                        style={{
                          borderColor: contact.stage.color,
                          color: contact.stage.color,
                        }}
                      >
                        {contact.stage.name}
                      </Badge>
                    )}
                  </div>
                  {contact.address && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      <MapPin className="w-3 h-3 inline mr-1" />
                      {[contact.address, contact.city, contact.state]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {contact.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {contact.phone}
                      </span>
                    )}
                    {contact.email && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3" />
                        {contact.email}
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/contacts/${contact.id}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground mt-1"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
