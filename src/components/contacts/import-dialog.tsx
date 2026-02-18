"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, ArrowRight } from "lucide-react";

const CONTACT_FIELDS = [
  { key: "firstName", label: "First Name", required: true },
  { key: "lastName", label: "Last Name", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zipCode", label: "ZIP Code" },
  { key: "carrier", label: "Insurance Carrier" },
  { key: "source", label: "Lead Source" },
  { key: "notes", label: "Notes" },
];

type Step = "upload" | "map" | "importing" | "done";

export function ImportDialog() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setPreview([]);
    setTotalRows(0);
    setMapping({});
    setResult(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    const ext = selectedFile.name.split(".").pop()?.toLowerCase();
    if (!validTypes.includes(selectedFile.type) && !["csv", "xlsx", "xls"].includes(ext || "")) {
      toast.error("Please upload a CSV or Excel file");
      return;
    }

    setFile(selectedFile);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/contacts/import", {
        method: "PUT",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || "Failed to parse file");
        return;
      }

      const data = await response.json();
      setHeaders(data.headers);
      setPreview(data.preview);
      setTotalRows(data.totalRows);
      setMapping(data.suggestions || {});
      setStep("map");
    } catch {
      toast.error("Failed to parse file");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    if (!mapping.firstName && !mapping.lastName) {
      toast.error("Please map at least First Name or Last Name");
      return;
    }

    setStep("importing");
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));

      const response = await fetch("/api/contacts/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Import failed");
        setStep("map");
        return;
      }

      setResult({
        created: data.created,
        skipped: data.skipped,
        errors: data.errors || [],
      });
      setStep("done");
      router.refresh();
    } catch {
      toast.error("Import failed");
      setStep("map");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="w-4 h-4" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Contacts</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to import your customer list.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="py-8">
            <div
              className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="font-medium mb-1">
                {isLoading ? "Parsing file..." : "Drop your file here or click to browse"}
              </p>
              <p className="text-sm text-muted-foreground">Supports .csv, .xlsx, and .xls files</p>
              {isLoading && <Loader2 className="w-6 h-6 animate-spin mx-auto mt-4" />}
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

        {/* Step 2: Column Mapping */}
        {step === "map" && (
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                <strong>{totalRows}</strong> rows found in <strong>{file?.name}</strong>
              </p>
              <Badge variant="secondary">{headers.length} columns</Badge>
            </div>

            <div className="space-y-3">
              {CONTACT_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center gap-3">
                  <div className="w-36 shrink-0">
                    <Label className="text-sm">
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  <Select
                    value={mapping[field.key] || "__none__"}
                    onValueChange={(v) => setMapping((prev) => ({
                      ...prev,
                      [field.key]: v === "__none__" ? "" : v,
                    }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Skip this field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- Skip --</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {preview.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
                  Preview (first {preview.length} rows)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {headers.slice(0, 6).map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {headers.slice(0, 6).map((h) => (
                            <td key={h} className="px-3 py-2 truncate max-w-[150px]">{row[h]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Importing */}
        {step === "importing" && (
          <div className="py-12 text-center">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary mb-4" />
            <p className="font-medium">Importing contacts...</p>
            <p className="text-sm text-muted-foreground mt-1">This may take a moment for large files.</p>
          </div>
        )}

        {/* Step 4: Done */}
        {step === "done" && result && (
          <div className="py-8 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
            <div>
              <p className="text-lg font-semibold">Import Complete!</p>
              <div className="mt-3 space-y-1 text-sm">
                <p><strong>{result.created}</strong> contacts imported</p>
                {result.skipped > 0 && (
                  <p className="text-muted-foreground">{result.skipped} duplicates skipped</p>
                )}
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="text-left bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">{result.errors.length} warning(s)</p>
                {result.errors.slice(0, 5).map((err, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{err}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "map" && (
            <>
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={handleImport} disabled={isLoading || (!mapping.firstName && !mapping.lastName)}>
                Import {totalRows} Contacts
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => { setOpen(false); reset(); }}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
