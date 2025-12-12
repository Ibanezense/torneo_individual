// Layout for mobile scoring routes (no sidebar, optimized for mobile)
import { Target } from "lucide-react";
import Link from "next/link";

export default function ScoringLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Simple header */}
            <header className="flex h-14 items-center justify-center border-b bg-card px-4">
                <Link href="/" className="flex items-center gap-2">
                    <Target className="h-6 w-6 text-primary" />
                    <span className="font-bold">Archery Manager</span>
                </Link>
            </header>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
    );
}
