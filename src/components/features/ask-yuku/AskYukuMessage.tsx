"use client";

import ReactMarkdown from "react-markdown";
import type { UIMessage } from "ai";
import { AskYukuLocationCard } from "./AskYukuLocationCard";
import { AskYukuTripPlanCard, type TripPlanData } from "./AskYukuTripPlanCard";
import { isSafeUrl } from "@/lib/utils/urlSafety";


type AskYukuMessageProps = {
  message: UIMessage;
  onClosePanel?: () => void;
};

type LocationToolResult = {
  id: string;
  slug: string;
  name: string;
  category: string;
  city: string;
  rating: number | null;
  image: string;
  primaryPhotoUrl: string | null;
};

type ToolContext = {
  toolName: string | null;
  toolInput: Record<string, unknown>;
};

function extractToolContext(message: UIMessage): ToolContext {
  for (const part of message.parts) {
    if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = part as any;
      if (p.state !== "output-available") continue;
      const result = p.output as Record<string, unknown> | undefined;
      if (!result) continue;
      if (result.locations && Array.isArray(result.locations)) {
        return {
          toolName: p.toolName ?? p.toolInvocation?.toolName ?? null,
          toolInput: p.input ?? p.toolInvocation?.args ?? {},
        };
      }
    }
  }
  return { toolName: null, toolInput: {} };
}

function buildBrowseUrl(basePath: string, toolName: string | null, toolInput: Record<string, unknown>): string | null {
  const params = new URLSearchParams();
  if (toolInput.city) params.set("city", String(toolInput.city));
  if (toolInput.region) params.set("region", String(toolInput.region));
  if (toolInput.category) params.set("category", String(toolInput.category));
  if (toolInput.query) params.set("q", String(toolInput.query));
  if (toolInput.jtaApproved) params.set("jta", "true");
  const qs = params.toString();
  if (!qs) return null;
  // nearby searches aren't browseable by filter (no city/category param), skip
  if (toolName === "searchNearby") return null;
  return `${basePath}/places?${qs}`;
}

function buildBrowseLabel(toolInput: Record<string, unknown>): string {
  const parts: string[] = [];
  if (toolInput.jtaApproved) parts.push("JTA Approved");
  if (toolInput.category) parts.push(String(toolInput.category));
  if (toolInput.city) parts.push(`in ${String(toolInput.city)}`);
  else if (toolInput.region) parts.push(`in ${String(toolInput.region)}`);
  else if (toolInput.query) parts.push(`for "${String(toolInput.query)}"`);
  return parts.length > 0 ? `Browse all ${parts.join(" ")}` : "Browse all";
}

function extractLocations(message: UIMessage): LocationToolResult[] {
  const locations: LocationToolResult[] = [];
  const seenIds = new Set<string>();

  for (const part of message.parts) {
    // Tool parts with output contain results
    if (
      part.type.startsWith("tool-") ||
      part.type === "dynamic-tool"
    ) {
      const toolPart = part as { state: string; output?: unknown };
      if (toolPart.state !== "output-available") continue;
      const result = toolPart.output as Record<string, unknown> | undefined;
      if (!result) continue;

      // Handle searchLocations / searchNearby results
      if (result.locations && Array.isArray(result.locations)) {
        for (const loc of result.locations) {
          if (loc.id && !seenIds.has(loc.id)) {
            seenIds.add(loc.id);
            locations.push(loc);
          }
        }
      }

      // Handle getLocationDetails result
      if (result.location && typeof result.location === "object") {
        const loc = result.location as LocationToolResult;
        if (loc.id && !seenIds.has(loc.id)) {
          seenIds.add(loc.id);
          locations.push(loc);
        }
      }
    }
  }

  return locations;
}

function extractTripPlan(message: UIMessage): TripPlanData | null {
  for (const part of message.parts) {
    if (
      part.type.startsWith("tool-") ||
      part.type === "dynamic-tool"
    ) {
      const toolPart = part as { state: string; output?: unknown };
      if (toolPart.state !== "output-available") continue;
      const result = toolPart.output as Record<string, unknown> | undefined;
      if (!result) continue;

      if (result.type === "tripPlan" && result.plan) {
        return result as unknown as TripPlanData;
      }
    }
  }
  return null;
}

function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function AskYukuMessage({ message, onClosePanel }: AskYukuMessageProps) {
  const isUser = message.role === "user";
  const locations = isUser ? [] : extractLocations(message);
  const tripPlan = isUser ? null : extractTripPlan(message);
  const textContent = getTextContent(message);
  const { toolName, toolInput } = isUser ? { toolName: null, toolInput: {} } : extractToolContext(message);
  const basePath = "";
  const viewAllUrl = locations.length >= 2
    ? `${basePath}/places?yuku=${locations.map((l) => l.id).join(",")}`
    : null;
  const browseUrl = buildBrowseUrl(basePath, toolName, toolInput);
  const browseLabel = buildBrowseLabel(toolInput);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
          isUser
            ? "bg-brand-primary text-white"
            : "bg-surface text-foreground"
        }`}
      >
        {textContent && (
          <div className="chat-markdown text-sm leading-relaxed">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                strong: ({ children }) => (
                  <strong className="font-semibold">{children}</strong>
                ),
                ul: ({ children }) => (
                  <ul className="mb-1.5 ml-4 list-disc last:mb-0">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-1.5 ml-4 list-decimal last:mb-0">{children}</ol>
                ),
                li: ({ children }) => <li className="mb-0.5">{children}</li>,
                a: ({ href, children }) => {
                  // Handle location:ID links
                  if (href?.startsWith("location:")) {
                    return (
                      <span className="font-semibold text-brand-primary">
                        {children}
                      </span>
                    );
                  }
                  return (
                    <a
                      href={isSafeUrl(href) ? href : undefined}
                      className="text-brand-primary underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {textContent}
            </ReactMarkdown>
          </div>
        )}

        {tripPlan && (
          <AskYukuTripPlanCard data={tripPlan} onClose={onClosePanel} />
        )}

        {locations.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {locations.map((loc) => (
              <AskYukuLocationCard
                key={loc.id}
                slug={loc.slug}
                name={loc.name}
                category={loc.category}
                city={loc.city}
                rating={loc.rating}
                image={loc.image}
                primaryPhotoUrl={loc.primaryPhotoUrl}
              />
            ))}
            {(viewAllUrl || browseUrl) && (
              <div className="mt-1 flex flex-col gap-1">
                {viewAllUrl && (
                  <a
                    href={viewAllUrl}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-brand-primary/30 py-2 text-xs font-medium text-brand-primary transition-colors hover:bg-brand-primary/10"
                  >
                    View these {locations.length} in Places
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </a>
                )}
                {browseUrl && (
                  <a
                    href={browseUrl}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-border/50 py-2 text-xs font-medium text-foreground-secondary transition-colors hover:border-brand-primary/30 hover:text-brand-primary"
                  >
                    {browseLabel}
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
