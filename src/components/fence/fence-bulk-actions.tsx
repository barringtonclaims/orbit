"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { updateContactsStagesBatch } from "@/lib/actions/stages";
import { X, ArrowRight, Download, Loader2, Zap } from "lucide-react";
import type { FenceContactResult } from "@/lib/actions/fences";
import { FenceBulkJoshDialog } from "@/components/fence/fence-bulk-josh-dialog";

interface Stage {
  id: string;
  name: string;
  color: string;
}

interface FenceBulkActionsProps {
  selectedIds: Set<string>;
  results: FenceContactResult[];
  stages: Stage[];
  onClearSelection: () => void;
  onActionComplete: () => void;
}

export function FenceBulkActions({
  selectedIds,
  results,
  stages,
  onClearSelection,
  onActionComplete,
}: FenceBulkActionsProps) {
  const [isActing, setIsActing] = useState(false);
  const [showJoshDialog, setShowJoshDialog] = useState(false);

  const selectedContacts = results.filter((r) => selectedIds.has(r.id));

  if (selectedIds.size === 0) return null;

  const handleChangeStage = async (stageId: string) => {
    setIsActing(true);
    try {
      const contactIds = Array.from(selectedIds);
      const result = await updateContactsStagesBatch(contactIds, stageId);
      if ("error" in result && result.error) {
        toast.error(result.error);
      } else if ("succeeded" in result) {
        toast.success(
          `Updated ${result.succeeded} of ${result.total} contacts`
        );
        onClearSelection();
        onActionComplete();
      }
    } catch {
      toast.error("Failed to update stages");
    } finally {
      setIsActing(false);
    }
  };

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

  return (<>
    {createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-background border-2 rounded-xl shadow-2xl px-5 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4">
      <span className="font-semibold text-sm whitespace-nowrap">
        {selectedIds.size} selected
      </span>

      <div className="w-px h-6 bg-border" />

      {/* Change Stage */}
      <Select onValueChange={handleChangeStage} disabled={isActing}>
        <SelectTrigger className="w-[170px] h-9">
          <div className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4" />
            <span>Change Stage</span>
          </div>
        </SelectTrigger>
        <SelectContent>
          {stages.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Josh AI */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowJoshDialog(true)}
        disabled={isActing}
        className="h-9"
      >
        <Zap className="w-4 h-4 mr-1" />
        Josh
      </Button>

      {/* Export CSV */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleExportCsv}
        disabled={isActing}
        className="h-9"
      >
        <Download className="w-4 h-4 mr-1" />
        Export
      </Button>

      {/* Loading indicator */}
      {isActing && <Loader2 className="w-4 h-4 animate-spin" />}

      {/* Clear */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onClearSelection}
        className="h-8 w-8"
      >
        <X className="w-4 h-4" />
      </Button>
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
