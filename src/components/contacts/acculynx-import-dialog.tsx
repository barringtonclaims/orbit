"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Users,
  UserPlus,
  ShieldAlert,
  Snowflake,
  XCircle,
} from "lucide-react";

type Step = "upload" | "preview" | "importing" | "done";

interface ImportPreview {
  newLead: number;
  claimProspect: number;
  retailProspect: number;
  seasonal: number;
  notInterested: number;
  skippedJunk: number;
  skippedDeadFiltered: number;
  total: number;
}

interface ImportResult extends ImportPreview {
  created: number;
  skippedDuplicate: number;
  updatedAddresses: number;
  errors: string[];
}

interface AccuLynxImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function AccuLynxImportDialog({ open, onOpenChange, onComplete }: AccuLynxImportDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setResult(null);
    setIsLoading(false);
    setElapsedSeconds(0);
    setProgressPct(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // Animate a fake progress bar during import (ramps to 90%, then holds)
  useEffect(() => {
    if (step === "importing") {
      setElapsedSeconds(0);
      setProgressPct(5);
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed += 1;
        setElapsedSeconds(elapsed);
        // Asymptotic curve: approaches 90% over ~30s, holds there
        setProgressPct(Math.min(90, 90 * (1 - Math.exp(-elapsed / 20))));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (step === "done") setProgressPct(100);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext || "")) {
      toast.error("Please upload a CSV or Excel file");
      return;
    }

    setFile(selectedFile);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/contacts/import/acculynx", {
        method: "PUT",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Failed to parse file");
        setFile(null);
        return;
      }

      setPreview(data.preview);
      setStep("preview");
    } catch {
      toast.error("Failed to parse file");
      setFile(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setStep("importing");
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/contacts/import/acculynx", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Import failed");
        setStep("preview");
        return;
      }

      setResult(data);
      setStep("done");
      router.refresh();
    } catch {
      toast.error("Import failed");
      setStep("preview");
    } finally {
      setIsLoading(false);
    }
  };

  const importableCount = preview
    ? preview.newLead + preview.claimProspect + preview.retailProspect + preview.seasonal + preview.notInterested
    : 0;

  const skippedCount = preview
    ? preview.skippedJunk + preview.skippedDeadFiltered
    : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && step === "importing") return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from AccuLynx</DialogTitle>
          <DialogDescription>
            Upload your AccuLynx Lead Status Report CSV. Contacts will be automatically
            categorized based on their milestone and activity.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="py-6">
            <div
              className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium mb-1">
                {isLoading ? "Analyzing file..." : "Drop your AccuLynx export here"}
              </p>
              <p className="text-sm text-muted-foreground">
                Lead Status Report (.csv, .xlsx)
              </p>
              {isLoading && <Loader2 className="w-5 h-5 animate-spin mx-auto mt-3" />}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                <strong>{preview.total}</strong> rows in <strong>{file?.name}</strong>
              </span>
              <Badge variant="secondary">{importableCount} to import</Badge>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Will be imported as:</p>
              <div className="grid grid-cols-1 gap-2">
                {preview.newLead > 0 && (
                  <StageRow icon={UserPlus} label="New Lead" count={preview.newLead} color="text-indigo-500" />
                )}
                {preview.claimProspect > 0 && (
                  <StageRow icon={ShieldAlert} label="Claim Prospect" count={preview.claimProspect} color="text-purple-500" />
                )}
                {preview.retailProspect > 0 && (
                  <StageRow icon={Users} label="Retail Prospect" count={preview.retailProspect} color="text-amber-500" />
                )}
                {preview.seasonal > 0 && (
                  <StageRow icon={Snowflake} label="Seasonal Follow Up" count={preview.seasonal} color="text-cyan-500" />
                )}
                {preview.notInterested > 0 && (
                  <StageRow icon={XCircle} label="Not Interested" count={preview.notInterested} color="text-red-500" />
                )}
              </div>
            </div>

            {skippedCount > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  {skippedCount} rows will be skipped
                </p>
                {preview.skippedJunk > 0 && (
                  <p className="text-muted-foreground text-xs pl-5">
                    {preview.skippedJunk} junk/empty entries (no contact info)
                  </p>
                )}
                {preview.skippedDeadFiltered > 0 && (
                  <p className="text-muted-foreground text-xs pl-5">
                    {preview.skippedDeadFiltered} filtered out (Do Not Contact / Bad Lead)
                  </p>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Active leads (touched within 90 days) will get follow-up tasks.
              Duplicates are detected automatically — existing contacts with missing
              addresses will be updated from the CSV.
            </p>
          </div>
        )}

        {step === "importing" && (
          <div className="py-8 space-y-5">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-3" />
              <p className="font-medium">Importing {importableCount.toLocaleString()} contacts...</p>
              <p className="text-sm text-muted-foreground mt-1">
                {elapsedSeconds < 5
                  ? "Analyzing and deduplicating your data..."
                  : elapsedSeconds < 15
                  ? "Writing contacts to the database..."
                  : "Creating follow-up tasks and timeline notes..."}
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-right">
                {elapsedSeconds}s elapsed
              </p>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Do not close this window.
            </p>
          </div>
        )}

        {step === "done" && result && (
          <div className="py-6 text-center space-y-4">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
            <div>
              <p className="text-lg font-semibold">Import Complete</p>
              <div className="mt-3 space-y-1.5 text-sm">
                <p><strong>{result.created}</strong> contacts imported</p>
                {result.updatedAddresses > 0 && (
                  <p className="text-green-600">{result.updatedAddresses} existing contacts updated with addresses</p>
                )}
                {result.skippedDuplicate > 0 && (
                  <p className="text-muted-foreground">{result.skippedDuplicate} duplicates skipped</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-left max-w-xs mx-auto">
              {result.newLead > 0 && <StatBadge label="New Lead" count={result.newLead} />}
              {result.claimProspect > 0 && <StatBadge label="Claim Prospect" count={result.claimProspect} />}
              {result.retailProspect > 0 && <StatBadge label="Retail Prospect" count={result.retailProspect} />}
              {result.seasonal > 0 && <StatBadge label="Seasonal" count={result.seasonal} />}
              {result.notInterested > 0 && <StatBadge label="Not Interested" count={result.notInterested} />}
            </div>

            {result.errors.length > 0 && (
              <div className="text-left bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">
                  {result.errors.length} warning(s)
                </p>
                {result.errors.slice(0, 5).map((err, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{err}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={handleImport} disabled={isLoading || importableCount === 0}>
                <Upload className="w-4 h-4 mr-2" />
                Import {importableCount} Contacts
              </Button>
            </>
          )}
          {step === "done" && (
            <Button
              onClick={() => {
                onOpenChange(false);
                reset();
                onComplete?.();
              }}
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StageRow({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm">{label}</span>
      </div>
      <Badge variant="outline" className="text-xs">{count}</Badge>
    </div>
  );
}

function StatBadge({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-muted/50 rounded px-2 py-1">
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="font-medium">{count}</span>
    </div>
  );
}
