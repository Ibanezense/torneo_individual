"use client";

import { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User as UserIcon, Target } from "lucide-react";
import { MobileMenuButton } from "./Sidebar";

interface HeaderProps {
    user: User;
    onMenuClick: () => void;
}

export function Header({ user, onMenuClick }: HeaderProps) {
    const router = useRouter();
    const supabase = createClient();

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
    };

    const initials = user.email
        ? user.email.substring(0, 2).toUpperCase()
        : "AD";

    return (
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
            <div className="flex items-center gap-3">
                {/* Mobile Menu Toggle */}
                <MobileMenuButton onClick={onMenuClick} />

                {/* Mobile Logo - only visible on mobile */}
                <div className="flex items-center gap-2 lg:hidden">
                    <Target className="h-6 w-6 text-blue-600" />
                    <span className="font-bold text-slate-900">Admin</span>
                </div>

                {/* Desktop Title */}
                <h1 className="hidden text-lg font-semibold text-slate-900 lg:block">
                    Panel de Administración
                </h1>
            </div>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                        <Avatar className="h-10 w-10 border-2 border-slate-200">
                            <AvatarFallback className="bg-blue-100 text-blue-700 font-bold">
                                {initials}
                            </AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                        <div className="flex flex-col space-y-1">
                            <p className="text-sm font-medium">Mi Cuenta</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                        <UserIcon className="mr-2 h-4 w-4" />
                        Perfil
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
                        <LogOut className="mr-2 h-4 w-4" />
                        Cerrar Sesión
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </header>
    );
}
