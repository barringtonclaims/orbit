"use client";

import { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  MapPinned,
  Plus,
  Filter,
  Search,
  Trash2,
  Save,
  Loader2,
  Locate,
  Pencil,
  X,
} from "lucide-react";
import {
  createFence,
  deleteFence,
  getContactsInFence,
  getGeocodedContacts,
  type FenceData,
  type FenceContactResult,
} from "@/lib/actions/fences";
import {
  FenceFilterDialog,
  type FenceFilters,
} from "@/components/fence/fence-filter-dialog";
import { FenceResultsPanel } from "@/components/fence/fence-results-panel";
import { FenceBulkActions } from "@/components/fence/fence-bulk-actions";

const FenceMap = dynamic(() => import("@/components/fence/fence-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted rounded-lg">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

interface ContactPin {
  id: string;
  firstName: string;
  lastName: string;
  latitude: number;
  longitude: number;
  stage: { name: string; color: string } | null;
}

interface Stage {
  id: string;
  name: string;
  color: string;
  isTerminal?: boolean;
}

interface TeamMember {
  id: string;
  fullName: string;
}

interface FenceViewProps {
  initialFences: FenceData[];
  initialContacts: ContactPin[];
  stages: Stage[];
  teamMembers: TeamMember[];
}

export function FenceView({
  initialFences,
  initialContacts,
  stages,
  teamMembers,
}: FenceViewProps) {
  // Fences state
  const [fences, setFences] = useState<FenceData[]>(initialFences);
  const [activeFenceId, setActiveFenceId] = useState<string | null>(null);
  const [drawnCoords, setDrawnCoords] = useState<number[][] | null>(null);

  // Contact pins on map
  const [contacts, setContacts] = useState<ContactPin[]>(initialContacts);

  // Filter state
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [filters, setFilters] = useState<FenceFilters>({
    stageIds: [],
    stageType: "",
    jobStatus: "",
    assignedToId: "",
  });

  // Results state
  const [results, setResults] = useState<FenceContactResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Save dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Geocoding progress state
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState<{
    current: number;
    total: number;
    geocoded: number;
    failed: number;
    totalContacts?: number;
    alreadyGeocoded?: number;
    noAddressCount?: number;
  } | null>(null);

  // Determine the active polygon coordinates
  const activeCoords = useMemo(() => {
    if (drawnCoords) return drawnCoords;
    if (activeFenceId) {
      const fence = fences.find((f) => f.id === activeFenceId);
      return fence?.coordinates ?? null;
    }
    return null;
  }, [drawnCoords, activeFenceId, fences]);

  const activeFenceName = useMemo(() => {
    if (drawnCoords && !activeFenceId) return "Drawn Area";
    if (activeFenceId) {
      return fences.find((f) => f.id === activeFenceId)?.name ?? null;
    }
    return null;
  }, [drawnCoords, activeFenceId, fences]);

  // Map callbacks
  const handlePolygonDrawn = useCallback(
    (coords: number[][]) => {
      setDrawnCoords(coords);
      setActiveFenceId(null);
      setResults([]);
      setSelectedIds(new Set());
    },
    []
  );

  const handleFenceClick = useCallback(
    (fenceId: string) => {
      setActiveFenceId(fenceId);
      setDrawnCoords(null);
      setResults([]);
      setSelectedIds(new Set());
    },
    []
  );

  // Filter & search
  const handleApplyFilters = useCallback(
    async (newFilters: FenceFilters) => {
      setFilters(newFilters);
      if (!activeCoords) {
        toast.error("Draw or select a fence first");
        return;
      }
      setIsSearching(true);
      setSelectedIds(new Set());
      try {
        const res = await getContactsInFence(activeCoords, {
          stageIds:
            newFilters.stageIds.length > 0 ? newFilters.stageIds : undefined,
          stageType: newFilters.stageType || undefined,
          jobStatus: newFilters.jobStatus || undefined,
          assignedToId: newFilters.assignedToId || undefined,
        });
        if (res.error) {
          toast.error(res.error);
        } else {
          setResults(res.data);
          if (res.data.length === 0) {
            toast.info("No contacts found in this area");
          }
        }
      } catch {
        toast.error("Search failed");
      } finally {
        setIsSearching(false);
      }
    },
    [activeCoords]
  );

  const handleQuickSearch = useCallback(async () => {
    if (!activeCoords) {
      toast.error("Draw or select a fence first");
      return;
    }
    await handleApplyFilters(filters);
  }, [activeCoords, filters, handleApplyFilters]);

  // Save fence
  const handleSaveFence = useCallback(async () => {
    if (!activeCoords || !saveName.trim()) return;
    setIsSaving(true);
    try {
      const res = await createFence({
        name: saveName.trim(),
        coordinates: activeCoords,
      });
      if (res.error) {
        toast.error(res.error);
      } else if (res.data) {
        setFences((prev) => [res.data!, ...prev]);
        setActiveFenceId(res.data.id);
        setDrawnCoords(null);
        setSaveName("");
        setShowSaveDialog(false);
        toast.success("Fence saved");
      }
    } catch {
      toast.error("Failed to save fence");
    } finally {
      setIsSaving(false);
    }
  }, [activeCoords, saveName]);

  // Delete fence
  const handleDeleteFence = useCallback(
    async (id: string) => {
      try {
        const res = await deleteFence(id);
        if (res.error) {
          toast.error(res.error);
        } else {
          setFences((prev) => prev.filter((f) => f.id !== id));
          if (activeFenceId === id) {
            setActiveFenceId(null);
            setResults([]);
            setSelectedIds(new Set());
          }
          toast.success("Fence deleted");
        }
      } catch {
        toast.error("Failed to delete fence");
      }
    },
    [activeFenceId]
  );

  // Selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(results.map((r) => r.id)));
  }, [results]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Batch geocode via SSE streaming route
  const handleBatchGeocode = useCallback(async () => {
    setIsGeocoding(true);
    setGeocodeProgress(null);

    try {
      const response = await fetch("/api/geocode-batch");
      if (!response.ok) {
        toast.error("Geocoding failed to start");
        setIsGeocoding(false);
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "start") {
              if (event.total === 0) {
                const parts: string[] = [];
                if (event.totalContacts === 0) {
                  parts.push("No contacts found in this organization.");
                } else {
                  if (event.alreadyGeocoded > 0)
                    parts.push(`${event.alreadyGeocoded} already geocoded`);
                  if (event.noAddressCount > 0)
                    parts.push(`${event.noAddressCount} have no address data`);
                  if (parts.length === 0)
                    parts.push("All contacts are already geocoded.");
                }
                toast.info(
                  `Nothing to geocode. ${parts.join(", ")}. (${event.totalContacts} total contacts)`
                );
                setIsGeocoding(false);
                setGeocodeProgress(null);
                return;
              }
              setGeocodeProgress({
                current: 0,
                total: event.total,
                geocoded: 0,
                failed: 0,
                totalContacts: event.totalContacts,
                alreadyGeocoded: event.alreadyGeocoded,
                noAddressCount: event.noAddressCount,
              });
            } else if (event.type === "progress") {
              setGeocodeProgress((prev) => ({
                ...prev,
                current: event.current,
                total: event.total,
                geocoded: event.geocoded,
                failed: event.failed,
              }));
            } else if (event.type === "done") {
              toast.success(
                `Geocoded ${event.geocoded} of ${event.total} contacts${event.failed > 0 ? ` (${event.failed} failed)` : ""}`
              );
              const updated = await getGeocodedContacts();
              if (updated.data) setContacts(updated.data);
            }
          } catch {
            // skip malformed event
          }
        }
      }
    } catch {
      toast.error("Geocoding failed");
    } finally {
      setIsGeocoding(false);
      setGeocodeProgress(null);
    }
  }, []);

  const hasActiveFilters =
    filters.stageIds.length > 0 ||
    filters.stageType ||
    filters.jobStatus ||
    filters.assignedToId;

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] -mx-4 md:-mx-6 -mt-4 md:-mt-6">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b bg-background shrink-0">
        <div className="flex items-center gap-2">
          <MapPinned className="w-5 h-5" />
          <h1 className="text-lg font-semibold">Fence</h1>
          <Badge variant="secondary" className="text-xs">
            {contacts.length} pinned
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          {isGeocoding && geocodeProgress ? (
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-[160px]">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {geocodeProgress.current} / {geocodeProgress.total}
                  </span>
                  <span className="text-green-600">
                    {geocodeProgress.geocoded} found
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{
                      width: geocodeProgress.total > 0
                        ? `${(geocodeProgress.current / geocodeProgress.total) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          ) : isGeocoding ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Starting...</span>
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={handleBatchGeocode}
            disabled={isGeocoding}
          >
            {isGeocoding ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Locate className="w-4 h-4 mr-1" />
            )}
            Geocode All
          </Button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Map area */}
        <div className="flex-1 relative isolate min-h-[50vh] md:min-h-0">
          <FenceMap
            contacts={contacts}
            fences={fences}
            activeFenceId={activeFenceId}
            onPolygonDrawn={handlePolygonDrawn}
            onFenceClick={handleFenceClick}
          />

          {/* Floating actions over map */}
          {activeCoords && (
            <div className="absolute top-3 right-3 z-[500] flex items-center gap-2">
              <Button size="sm" onClick={handleQuickSearch} disabled={isSearching}>
                {isSearching ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-1" />
                )}
                Search
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowFilterDialog(true)}
              >
                <Filter className="w-4 h-4 mr-1" />
                Filters
                {hasActiveFilters && (
                  <Badge className="ml-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center">
                    !
                  </Badge>
                )}
              </Button>
              {drawnCoords && !activeFenceId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowSaveDialog(true)}
                >
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDrawnCoords(null);
                  setActiveFenceId(null);
                  setResults([]);
                  setSelectedIds(new Set());
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l bg-background flex flex-col shrink-0 max-h-[40vh] md:max-h-none overflow-y-auto">
          {/* Saved Fences section */}
          <div className="border-b">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Saved Fences
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {fences.length}
              </Badge>
            </div>
            <ScrollArea className="max-h-40">
              {fences.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3 pb-2">
                  Draw a polygon on the map and save it as a fence.
                </p>
              ) : (
                <div className="px-1 pb-1">
                  {fences.map((f) => (
                    <div
                      key={f.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-sm ${
                        activeFenceId === f.id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => handleFenceClick(f.id)}
                    >
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: f.color }}
                      />
                      <span className="truncate flex-1">{f.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFence(f.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Results section */}
          <div className="flex-1 min-h-0">
            <FenceResultsPanel
              results={results}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAll}
              onClearSelection={clearSelection}
              isLoading={isSearching}
              fenceName={activeFenceName}
            />
          </div>
        </div>
      </div>

      {/* Filter Dialog */}
      <FenceFilterDialog
        open={showFilterDialog}
        onOpenChange={setShowFilterDialog}
        stages={stages}
        teamMembers={teamMembers}
        filters={filters}
        onApply={handleApplyFilters}
      />

      {/* Save Fence Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Fence</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Fence name (e.g. Downtown Zone)"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && saveName.trim()) handleSaveFence();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={handleSaveFence}
              disabled={!saveName.trim() || isSaving}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Actions */}
      <FenceBulkActions
        selectedIds={selectedIds}
        results={results}
        onClearSelection={clearSelection}
        onActionComplete={handleQuickSearch}
      />
    </div>
  );
}
