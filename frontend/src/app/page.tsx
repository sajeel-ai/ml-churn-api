import Link from "next/link";
import { ArrowRight, BarChart3, Brain, FileSpreadsheet, History, Lock, Sparkles, Upload, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ModelSnapshot } from "@/components/model-snapshot";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: Sparkles, title: "Instant churn scoring", text: "Enter a customer profile and get the model's churn probability and risk level as you type." },
  { icon: Brain, title: "Explained, not a black box", text: "See which inputs raised or lowered the score for each prediction, using TreeSHAP model explanations." },
  { icon: Users, title: "Customer records", text: "Keep a list of customers, re-score them after a change, and track their prediction history." },
  { icon: Upload, title: "Bulk CSV prediction", text: "Upload a file, review a validation report, then score every valid row. Invalid rows are reported, never silently dropped." },
  { icon: History, title: "History and export", text: "Search, filter and export predictions to CSV, or download a printable report for any single prediction." },
  { icon: Lock, title: "Private by design", text: "Role-based access, server-side authorization and an audit trail for sensitive actions." },
];
const STEPS = [
  ["Describe the customer", "Fill in the 19 service, contract and billing fields, or upload a CSV."],
  ["Score with the model", "The same trained pipeline used in evaluation produces a probability."],
  ["Review the risk", "Probability is mapped to low, medium or high with a clearly stated policy."],
  ["Act and track", "Save results, export reports and revisit history over time."],
];

export default function Home() {
  return (
    <div className="ambient relative">
      <header className="relative z-10 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <nav aria-label="Primary" className="hidden items-center gap-6 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a><a href="#how" className="hover:text-foreground">How it works</a><a href="#model" className="hover:text-foreground">Model</a>
          </nav>
          <div className="flex items-center gap-2"><ThemeToggle className="hidden sm:inline-flex" />
            <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
            <Button asChild size="sm"><Link href="/register">Get started</Link></Button></div>
        </div>
      </header>

      <main id="main" className="relative z-10">
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 text-center sm:pt-24">
          <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-bold text-primary"><BarChart3 className="h-3.5 w-3.5" aria-hidden />Customer retention analytics</p>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">Know which customers are likely to leave, <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">before they do</span></h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">A machine-learning churn model with a clear interface: score one customer or a whole file, understand what drove the result, and keep a history you can search and export.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg"><Link href="/register">Create free account <ArrowRight className="h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/login">Sign in</Link></Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Predictions are model estimates, not guarantees.</p>
        </section>

        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Everything you need to work with churn risk</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <span className="mb-4 inline-flex rounded-xl bg-primary/10 p-2.5 text-primary"><f.icon className="h-5 w-5" aria-hidden /></span>
                <h3 className="font-bold">{f.title}</h3><p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">How it works</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="rounded-2xl border border-border bg-card p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">{i + 1}</span>
                <h3 className="mt-3 font-bold">{t}</h3><p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="model" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-3xl font-extrabold tracking-tight">About the model</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Figures below are loaded live from the deployed model&apos;s metadata. We show the trade-offs, including the limits of what was tested.</p></div>
            <FileSpreadsheet className="hidden h-10 w-10 text-muted-foreground sm:block" aria-hidden />
          </div>
          <ModelSnapshot />
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24 pt-8">
          <div className="rounded-3xl bg-navy px-6 py-12 text-center text-white">
            <h2 className="text-3xl font-extrabold tracking-tight">Try it with your own customer profile</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-white/70">Create an account and get your first prediction in under a minute.</p>
            <Button asChild size="lg" className="mt-6 bg-white text-navy hover:bg-white/90"><Link href="/register">Get started</Link></Button>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 sm:flex-row">
          <p>© {new Date().getFullYear()} Customer Churn Intelligence Platform</p>
          <p>Model estimates support, and do not replace, human judgement.</p>
          <div className="flex gap-4"><Link href="/login" className="hover:text-foreground">Sign in</Link><Link href="/register" className="hover:text-foreground">Register</Link></div>
        </div>
      </footer>
    </div>
  );
}
