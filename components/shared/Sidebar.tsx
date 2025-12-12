"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Trophy,
    Users,
    Target,
    BarChart3,
    Crosshair,
    QrCode,
    KeyRound,
    X,
    Menu,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface SidebarContentProps {
    pathname: string;
    onLinkClick?: () => void;
}

function SidebarContent({ pathname, onLinkClick }: SidebarContentProps) {
    // Extract tournament ID from pathname if we're inside a tournament
    const tournamentMatch = pathname.match(/\/admin\/tournaments\/([^/]+)/);
    const tournamentId = tournamentMatch ? tournamentMatch[1] : null;
    const isInTournament = tournamentId && tournamentId !== 'new';

    // Global links (always available)
    const globalLinks = [
        {
            title: "Dashboard",
            href: "/admin/dashboard",
            icon: LayoutDashboard,
        },
        {
            title: "Torneos",
            href: "/admin/tournaments",
            icon: Trophy,
        },
    ];

    // Tournament-specific links (only when inside a tournament)
    const tournamentLinks = isInTournament ? [
        {
            title: "Resumen",
            href: `/admin/tournaments/${tournamentId}`,
            icon: Target,
            exact: true,
        },
        {
            title: "Arqueros",
            href: `/admin/tournaments/${tournamentId}/archers`,
            icon: Users,
        },
        {
            title: "Asignaciones",
            href: `/admin/tournaments/${tournamentId}/assignments`,
            icon: Target,
        },
        {
            title: "Control Vivo",
            href: `/admin/tournaments/${tournamentId}/control`,
            icon: Crosshair,
        },
        {
            title: "Brackets",
            href: `/admin/tournaments/${tournamentId}/brackets`,
            icon: Trophy,
        },
        {
            title: "Rankings",
            href: `/admin/tournaments/${tournamentId}/rankings`,
            icon: BarChart3,
        },
        {
            title: "Códigos QR",
            href: `/admin/tournaments/${tournamentId}/qr-sheets`,
            icon: QrCode,
        },
        {
            title: "Códigos Acceso",
            href: `/admin/tournaments/${tournamentId}/access-codes`,
            icon: KeyRound,
        },
    ] : [];

    return (
        <nav className="space-y-1 p-4">
            {/* Global Links */}
            {globalLinks.map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        onClick={onLinkClick}
                        className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                            isActive
                                ? "bg-blue-600 text-white"
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        )}
                    >
                        <link.icon className="h-5 w-5" />
                        {link.title}
                    </Link>
                );
            })}

            {/* Tournament Section */}
            {isInTournament && (
                <>
                    <div className="pt-4 pb-2">
                        <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Torneo Actual
                        </p>
                    </div>
                    {tournamentLinks.map((link) => {
                        const isActive = link.exact
                            ? pathname === link.href
                            : pathname === link.href || pathname.startsWith(link.href + "/");
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={onLinkClick}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-amber-100 text-amber-800"
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                )}
                            >
                                <link.icon className="h-4 w-4" />
                                {link.title}
                            </Link>
                        );
                    })}
                </>
            )}
        </nav>
    );
}

// Desktop Sidebar
export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="hidden w-64 border-r border-slate-200 bg-white lg:block">
            <div className="flex h-16 items-center border-b border-slate-200 px-6">
                <Link href="/admin/dashboard" className="flex items-center gap-2">
                    <Target className="h-8 w-8 text-blue-600" />
                    <span className="text-xl font-bold text-slate-900">Archery Manager</span>
                </Link>
            </div>
            <ScrollArea className="h-[calc(100vh-4rem)]">
                <SidebarContent pathname={pathname} />
            </ScrollArea>
        </aside>
    );
}

// Mobile Sidebar with overlay
interface MobileSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
    const pathname = usePathname();

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                onClick={onClose}
            />

            {/* Sidebar Panel */}
            <div className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl lg:hidden">
                <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
                    <Link href="/admin/dashboard" className="flex items-center gap-2" onClick={onClose}>
                        <Target className="h-7 w-7 text-blue-600" />
                        <span className="text-lg font-bold text-slate-900">Archery Manager</span>
                    </Link>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>
                <ScrollArea className="h-[calc(100vh-4rem)]">
                    <SidebarContent pathname={pathname} onLinkClick={onClose} />
                </ScrollArea>
            </div>
        </>
    );
}

// Mobile Menu Button (for Header)
interface MobileMenuButtonProps {
    onClick: () => void;
}

export function MobileMenuButton({ onClick }: MobileMenuButtonProps) {
    return (
        <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClick}
        >
            <Menu className="h-6 w-6" />
        </Button>
    );
}
