import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendConciergeInquiryNotification } from "@/lib/email/emailService";
import { withApiHandler } from "@/lib/api/withApiHandler";
import { RATE_LIMITS } from "@/lib/api/rateLimits";
import { badRequest, internalError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";

const conciergeInquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Please enter a valid email"),
  message: z
    .string()
    .trim()
    .max(1500, "Message must be 1500 characters or fewer")
    .optional()
    .transform((v) => v || null),
  source: z.string().trim().max(50).optional(),
});

/**
 * POST /api/concierge/inquiries
 * Public endpoint. Captures a lead from the Yuku Concierge landing page.
 * Writes to concierge_inquiries and fires a notification email (non-blocking).
 */
export const POST = withApiHandler(
  async (request: NextRequest) => {
    let body: z.infer<typeof conciergeInquirySchema>;
    try {
      const raw = await request.json();
      body = conciergeInquirySchema.parse(raw);
    } catch (err) {
      const message =
        err instanceof z.ZodError
          ? err.errors.map((e) => e.message).join(", ")
          : "Invalid request body";
      return badRequest(message, undefined, { route: "/api/concierge/inquiries" });
    }

    const userAgent = request.headers.get("user-agent") ?? null;
    const supabase = getServiceRoleClient();

    const { data, error } = await supabase
      .from("concierge_inquiries")
      .insert({
        name: body.name,
        email: body.email.toLowerCase(),
        source: body.source ?? "concierge-landing",
        message: body.message ?? null,
        user_agent: userAgent,
      })
      .select("id, created_at")
      .single();

    if (error || !data) {
      logger.error(
        "Failed to insert concierge inquiry",
        error instanceof Error ? error : new Error(String(error)),
      );
      return internalError(
        "We couldn't save your inquiry. Please try again.",
        undefined,
        { route: "/api/concierge/inquiries" },
      );
    }

    sendConciergeInquiryNotification({
      name: body.name,
      email: body.email.toLowerCase(),
      message: body.message ?? null,
      createdAt: data.created_at,
    }).catch((err) =>
      logger.error(
        "Concierge inquiry notification email failed",
        err instanceof Error ? err : new Error(String(err)),
      ),
    );

    return NextResponse.json({ ok: true }, { status: 201 });
  },
  {
    rateLimit: RATE_LIMITS.CONCIERGE_INQUIRIES,
    requireJson: true,
  },
);
