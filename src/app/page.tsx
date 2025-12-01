import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  Users, 
  Calendar, 
  MessageSquare, 
  ArrowRight,
  Zap,
  Shield,
  Smartphone
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
            <span className="text-xl font-bold">Orbit</span>
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
            <Zap className="w-4 h-4" />
            Built for salespeople, by salespeople
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 animate-fade-in stagger-1">
            Never let a lead
            <span className="gradient-text"> fall through the cracks</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-fade-in stagger-2">
            Orbit automates your follow-up workflow so you can focus on closing deals. 
            Every contact has a task until it&apos;s done.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in stagger-3">
            <Link href="/signup">
              <Button size="lg" className="text-lg px-8 gap-2">
                Start for free
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
          <h2 className="text-3xl font-bold text-center mb-12">
            Everything you need to manage leads
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Users className="w-6 h-6" />}
              title="Contact Management"
              description="Store all lead info, photos, documents, and notes in one organized timeline."
            />
            <FeatureCard
              icon={<CheckCircle2 className="w-6 h-6" />}
              title="Smart Task Scheduling"
              description="Tasks auto-schedule to M/W/F so your week stays organized and predictable."
            />
            <FeatureCard
              icon={<Calendar className="w-6 h-6" />}
              title="Calendar Integration"
              description="Schedule inspections and appointments that sync with your calendar."
            />
            <FeatureCard
              icon={<MessageSquare className="w-6 h-6" />}
              title="Quick Messaging"
              description="Send personalized texts and emails with one tap using templates."
            />
            <FeatureCard
              icon={<Shield className="w-6 h-6" />}
              title="Team Management"
              description="Assign leads, track progress, and keep your team accountable."
            />
            <FeatureCard
              icon={<Smartphone className="w-6 h-6" />}
              title="Mobile First"
              description="Works beautifully on any device. Add to home screen for app-like experience."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold mb-6">
            Ready to streamline your workflow?
          </h2>
          <p className="text-muted-foreground mb-8">
            Join sales professionals who use Orbit to stay on top of every lead.
          </p>
          <Link href="/signup">
            <Button size="lg" className="text-lg px-8">
              Get Started Free
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
            <span className="font-semibold">Orbit</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Barrington Dynamics. All rights reserved.
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
