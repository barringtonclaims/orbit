"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wand2, Loader2, CheckCircle2 } from "lucide-react";
import { fixContactsWithoutTasks } from "@/lib/actions/tasks";
import { useRouter } from "next/navigation";

export function FixMissingTasksButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ message?: string; processed?: number } | null>(null);
  const router = useRouter();

  const handleClick = async () => {
    setIsLoading(true);
    setResult(null);
    
    try {
      const response = await fixContactsWithoutTasks();
      
      if (response.error) {
        setResult({ message: response.error });
      } else {
        setResult({ 
          message: response.message, 
          processed: response.processed 
        });
        // Refresh the page to show new tasks
        router.refresh();
      }
    } catch (error) {
      setResult({ message: "Failed to check contacts" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isLoading}
        className="gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking...
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4" />
            Fix Missing Tasks
          </>
        )}
      </Button>
      
      {result && (
        <span className={`text-sm ${result.processed && result.processed > 0 ? "text-green-600" : "text-muted-foreground"}`}>
          {result.processed && result.processed > 0 ? (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              Created {result.processed} task(s)
            </span>
          ) : (
            result.message
          )}
        </span>
      )}
    </div>
  );
}

