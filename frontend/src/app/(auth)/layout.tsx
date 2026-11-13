import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ambient relative flex min-h-screen flex-col">
      <header className="relative z-10 flex items-center justify-between px-6 py-4"><Logo /><ThemeToggle /></header>
      <main id="main" className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16">{children}</main>
    </div>
  );
}
