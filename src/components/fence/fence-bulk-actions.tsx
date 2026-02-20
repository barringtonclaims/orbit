"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { X, Download, Loader2, Zap } from "lucide-react";
import type { FenceContactResult } from "@/lib/actions/fences";
import { FenceBulkJoshDialog } from "@/components/fence/fence-bulk-josh-dialog";

interface FenceBulkActionsProps {
  selectedIds: Set<string>;
  results: FenceContactResult[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

export function FenceBulkActions({
  selectedIds,
  results,
  onClearSelection,
  onActionComplete,
}: FenceBulkActionsProps) {
  const [isActing, setIsActing] = useState(false);
  const [showJoshDialog, setShowJoshDialog] = useState(false);

  const selectedContacts = results.filter((r) => selectedIds.has(r.id));

  if (selectedIds.size === 0) return null;

  const handleExportCsv = () => {
    const selected = results.filter((r) => selectedIds.has(r.id));
    const headers = [
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "Address",
      "City",
      "State",
      "Zip",
      "Stage",
      "Assigned To",
    ];
    const rows = selected.map((c) => [
      c.firstName,
      c.lastName,
      c.email || "",
      c.phone || "",
      c.address || "",
      c.city || "",
      c.state || "",
      c.zipCode || "",
      c.stage?.name || "",
      c.assignedTo?.fullName || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fence-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selected.length} contacts`);
  };

  return (
    <>
      {createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-background border-2 rounded-xl shadow-2xl px-3 py-2 sm:px-5 sm:py-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3 max-w-[calc(100vw-2rem)] animate-in slide-in-from-bottom-4">
          <span className="font-semibold text-sm whitespace-nowrap">
            {selectedIds.size} selected
          </span>

          {/* Josh AI */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-9"
            disabled={isActing}
            onClick={() => setShowJoshDialog(true)}
          >
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">Josh</span>
          </Button>

          {/* Export CSV */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-9"
            disabled={isActing}
            onClick={handleExportCsv}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>

          <div className="w-px h-6 bg-border hidden sm:block" />

          {/* Clear */}
          <Button variant="ghost" size="sm" onClick={onClearSelection} disabled={isActing}>
            <X className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Clear</span>
          </Button>

          {isActing && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>,
        document.body
      )}

      <FenceBulkJoshDialog
        open={showJoshDialog}
        onOpenChange={setShowJoshDialog}
        contacts={selectedContacts}
        onComplete={() => {
          onClearSelection();
          onActionComplete();
        }}
      />
    </>
  );
}
