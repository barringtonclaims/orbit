import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  Users, 
  Calendar, 
  MessageSquare, 
  ArrowRight,
  Sparkles,
  Shield,
  Smartphone,
  Upload,
  Building2,
  Bot
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 glass">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-primary-foreground" />
            </div>
            <span className="text-xl font-bold">Relay</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Log in</Button>
            </Link>
            <Link href="/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent text-accent-foreground text-sm font-medium mb-8 animate-fade-in">
            <Sparkles className="w-4 h-4" />
            Smart CRM for contractors
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 animate-fade-in stagger-1">
            Your leads, organized.
            <span className="gradient-text"> Your follow-ups, automatic.</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-fade-in stagger-2">
            Relay keeps every customer moving through your pipeline &mdash; from first contact 
            to final invoice. AI-powered follow-ups, carrier management, and smart scheduling.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in stagger-3">
            <Link href="/signup">
              <Button size="lg" className="text-lg px-8 gap-2">
                Start managing your pipeline
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="text-lg px-8">
                Sign in
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 bg-muted/50">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-4">
            Everything you need to run your business
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            Built for roofing contractors, home service pros, and claims professionals who need 
            to stay on top of every lead without letting anything slip.
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Bot className="w-6 h-6" />}
              title="Josh AI Assistant"
              description="AI that reads your emails, creates leads from AccuLynx, and drafts follow-ups automatically."
            />
            <FeatureCard
              icon={<CheckCircle2 className="w-6 h-6" />}
              title="Office-Day Scheduling"
              description="Tasks auto-schedule to your office days. Every customer always has a next step."
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6" />}
              title="Carrier Follow-Ups"
              description="AI-drafted carrier emails with smart routing -- unified inboxes or per-adjuster, you choose."
            />
            <FeatureCard
              icon={<Users className="w-6 h-6" />}
              title="Pipeline Management"
              description="Track every lead from New Lead through Inspection, Quote, Claim, and Approval."
            />
            <FeatureCard
              icon={<Upload className="w-6 h-6" />}
              title="CSV Import"
              description="Upload your existing customer list and be running in minutes. Smart duplicate detection included."
            />
            <FeatureCard
              icon={<Calendar className="w-6 h-6" />}
              title="Google Calendar Sync"
              description="Inspections and appointments sync directly to your Google Calendar."
            />
            <FeatureCard
              icon={<MessageSquare className="w-6 h-6" />}
              title="Templates & Messaging"
              description="Pre-built SMS and email templates for every stage. Personalize with one tap."
            />
            <FeatureCard
              icon={<Building2 className="w-6 h-6" />}
              title="Multi-Organization"
              description="Run multiple businesses from one account. Each with its own customers, tasks, and Google integration."
            />
            <FeatureCard
              icon={<Smartphone className="w-6 h-6" />}
              title="Mobile Ready"
              description="Works on any device. Add to your home screen for an app-like experience."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold mb-6">
            Stop losing leads. Start closing more.
          </h2>
          <p className="text-muted-foreground mb-8">
            Join contractors who use Relay to manage their pipeline and never miss a follow-up.
          </p>
          <Link href="/signup">
            <Button size="lg" className="text-lg px-8 gap-2">
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-primary-foreground" />
            </div>
            <span className="font-semibold">Relay</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Barrington Dynamics. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ 
  icon, 
  title, 
  description 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl bg-card border hover:shadow-lg transition-shadow">
      <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
