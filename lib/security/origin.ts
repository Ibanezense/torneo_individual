import { NextRequest, NextResponse } from "next/server";

function normalizeOrigin(value: string): string | null {
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function getAllowedOrigins(request: NextRequest): Set<string> {
    const allowed = new Set<string>([request.nextUrl.origin]);
    const configuredOrigins = process.env.ALLOWED_ORIGINS;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

    if (siteUrl) {
        const normalizedSiteUrl = normalizeOrigin(siteUrl);
        if (normalizedSiteUrl) allowed.add(normalizedSiteUrl);
    }

    if (configuredOrigins) {
        for (const item of configuredOrigins.split(",")) {
            const normalized = normalizeOrigin(item.trim());
            if (normalized) allowed.add(normalized);
        }
    }

    return allowed;
}

export function enforceMutationOrigin(request: NextRequest): NextResponse | null {
    const originHeader = request.headers.get("origin");
    const refererHeader = request.headers.get("referer");
    const allowedOrigins = getAllowedOrigins(request);

    const candidateOrigin = originHeader
        ? normalizeOrigin(originHeader)
        : refererHeader
            ? normalizeOrigin(refererHeader)
            : null;

    // Allow non-browser clients that do not send Origin/Referer.
    if (!candidateOrigin) return null;

    if (!allowedOrigins.has(candidateOrigin)) {
        return NextResponse.json(
            { error: "Solicitud rechazada por politica de origen." },
            { status: 403 }
        );
    }

    return null;
}
