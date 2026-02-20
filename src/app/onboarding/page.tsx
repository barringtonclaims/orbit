"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOrganization } from "@/lib/actions/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Building2, FileSpreadsheet, ArrowRight } from "lucide-react";
import { AccuLynxImportDialog } from "@/components/contacts/acculynx-import-dialog";
import Link from "next/link";

type OnboardingStep = "company" | "import";

export default function OnboardingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("company");
  const [showImportDialog, setShowImportDialog] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error("Company name is required");
      return;
    }

    setIsLoading(true);
    try {
      const result = await createOrganization({ name: companyName.trim() });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Organization created!");
      setOnboardingStep("import");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipImport = () => {
    router.push("/dashboard");
  };

  const handleImportComplete = () => {
    toast.success("Contacts imported! Heading to your dashboard.");
    router.push("/contacts");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/10" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
      </div>

      <header className="p-4">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-primary-foreground" />
          </div>
          <span className="text-xl font-bold">Relay</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className={`w-2 h-2 rounded-full ${onboardingStep === "company" ? "bg-primary" : "bg-primary/40"}`} />
            <div className={`w-2 h-2 rounded-full ${onboardingStep === "import" ? "bg-primary" : "bg-muted-foreground/30"}`} />
          </div>

          {onboardingStep === "company" && (
            <Card className="animate-fade-in">
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Set up your workspace</CardTitle>
                <CardDescription>
                  Enter your company name to get started. You can change this later in Settings.
                </CardDescription>
              </CardHeader>

              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      type="text"
                      placeholder="e.g. Shake Guys Roofing"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      required
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>
                </CardContent>

                <CardFooter>
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isLoading || !companyName.trim()}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating workspace...
                      </>
                    ) : (
                      "Create Workspace"
                    )}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          )}

          {onboardingStep === "import" && (
            <Card className="animate-fade-in">
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <FileSpreadsheet className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Import your leads</CardTitle>
                <CardDescription>
                  Bring your existing leads from AccuLynx. We&apos;ll automatically
                  set their status and schedule follow-ups based on their activity.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => setShowImportDialog(true)}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Import from AccuLynx
                </Button>

                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={handleSkipImport}
                >
                  Skip for now
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <footer className="p-4 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Barrington Dynamics
      </footer>

      <AccuLynxImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onComplete={handleImportComplete}
      />
    </div>
  );
}
