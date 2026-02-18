"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getCarriers, createCarrier } from "@/lib/actions/carriers";
import {
  ChevronsUpDown,
  Check,
  Plus,
  Loader2,
  Search,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Carrier {
  id: string;
  name: string;
  emailType: "UNIFIED" | "PER_ADJUSTER";
  unifiedEmail: string | null;
}

interface CarrierSelectProps {
  value: string | null;
  adjusterEmail?: string | null;
  onChange: (carrierId: string | null, carrierName: string, adjusterEmail?: string | null) => void;
  disabled?: boolean;
}

export function CarrierSelect({
  value,
  adjusterEmail: initialAdjusterEmail,
  onChange,
  disabled,
}: CarrierSelectProps) {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Add new carrier form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmailType, setNewEmailType] = useState<"UNIFIED" | "PER_ADJUSTER">("PER_ADJUSTER");
  const [newUnifiedEmail, setNewUnifiedEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Adjuster email for PER_ADJUSTER carriers
  const [adjEmail, setAdjEmail] = useState(initialAdjusterEmail || "");

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCarriers();
  }, []);

  useEffect(() => {
    setAdjEmail(initialAdjusterEmail || "");
  }, [initialAdjusterEmail]);

  const loadCarriers = async () => {
    setIsLoading(false);
    const result = await getCarriers();
    if (result.data) {
      setCarriers(result.data as Carrier[]);
    }
    setIsLoading(false);
  };

  const selectedCarrier = carriers.find((c) => c.id === value);

  const filtered = search
    ? carriers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : carriers;

  const handleSelect = (carrier: Carrier) => {
    onChange(carrier.id, carrier.name, carrier.emailType === "PER_ADJUSTER" ? adjEmail || null : null);
    setSearch("");
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null, "", null);
    setSearch("");
    setOpen(false);
  };

  const handleAddCarrier = async () => {
    if (!newName.trim()) {
      toast.error("Carrier name is required");
      return;
    }
    setIsCreating(true);
    try {
      const result = await createCarrier({
        name: newName.trim(),
        emailType: newEmailType,
        unifiedEmail: newEmailType === "UNIFIED" ? newUnifiedEmail.trim() || undefined : undefined,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.data) {
        const newCarrier = result.data as Carrier;
        setCarriers((prev) => [...prev, newCarrier].sort((a, b) => a.name.localeCompare(b.name)));
        onChange(newCarrier.id, newCarrier.name, newCarrier.emailType === "PER_ADJUSTER" ? null : null);
        toast.success(`Added "${newCarrier.name}"`);
        setShowAddForm(false);
        setNewName("");
        setNewEmailType("PER_ADJUSTER");
        setNewUnifiedEmail("");
        setOpen(false);
      }
    } catch {
      toast.error("Failed to create carrier");
    } finally {
      setIsCreating(false);
    }
  };

  const handleAdjusterEmailBlur = () => {
    if (selectedCarrier?.emailType === "PER_ADJUSTER") {
      onChange(selectedCarrier.id, selectedCarrier.name, adjEmail.trim() || null);
    }
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            {selectedCarrier ? (
              <span className="flex items-center gap-2 truncate">
                <Building2 className="w-4 h-4 shrink-0 text-muted-foreground" />
                {selectedCarrier.name}
                <Badge variant="outline" className="text-[10px] py-0 px-1 shrink-0">
                  {selectedCarrier.emailType === "UNIFIED" ? "Unified" : "Per Adjuster"}
                </Badge>
              </span>
            ) : (
              <span className="text-muted-foreground">Select carrier...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          {/* Search */}
          <div className="flex items-center border-b px-3">
            <Search className="w-4 h-4 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground pl-2"
              placeholder="Search carriers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Carrier list */}
          <div className="max-h-60 overflow-y-auto p-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {search ? "No carriers match your search" : "No carriers configured"}
              </p>
            ) : (
              filtered.map((carrier) => (
                <button
                  key={carrier.id}
                  className={cn(
                    "relative flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none cursor-pointer hover:bg-accent hover:text-accent-foreground",
                    value === carrier.id && "bg-accent"
                  )}
                  onClick={() => handleSelect(carrier)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === carrier.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{carrier.name}</span>
                  <Badge variant="outline" className="ml-auto text-[10px] py-0 px-1 shrink-0">
                    {carrier.emailType === "UNIFIED" ? "Unified" : "Per Adj."}
                  </Badge>
                </button>
              ))
            )}

            {value && (
              <button
                className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
                onClick={handleClear}
              >
                Clear selection
              </button>
            )}
          </div>

          {/* Add new carrier */}
          <div className="border-t p-2">
            {showAddForm ? (
              <div className="space-y-2">
                <Input
                  placeholder="Carrier name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
                <Select
                  value={newEmailType}
                  onValueChange={(v) => setNewEmailType(v as "UNIFIED" | "PER_ADJUSTER")}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNIFIED">Unified Email</SelectItem>
                    <SelectItem value="PER_ADJUSTER">Per Adjuster</SelectItem>
                  </SelectContent>
                </Select>
                {newEmailType === "UNIFIED" && (
                  <Input
                    placeholder="claims@carrier.com"
                    value={newUnifiedEmail}
                    onChange={(e) => setNewUnifiedEmail(e.target.value)}
                    type="email"
                  />
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={handleAddCarrier}
                    disabled={isCreating}
                  >
                    {isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewName("");
                      setNewEmailType("PER_ADJUSTER");
                      setNewUnifiedEmail("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-2 text-muted-foreground"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="w-4 h-4" />
                Add New Carrier
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Adjuster email field for PER_ADJUSTER carriers */}
      {selectedCarrier?.emailType === "PER_ADJUSTER" && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Adjuster Email</Label>
          <Input
            placeholder="adjuster@email.com"
            value={adjEmail}
            onChange={(e) => setAdjEmail(e.target.value)}
            onBlur={handleAdjusterEmailBlur}
            type="email"
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
