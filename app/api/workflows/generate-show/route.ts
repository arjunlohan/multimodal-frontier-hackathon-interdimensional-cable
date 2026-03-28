import { NextResponse } from "next/server";
import { getRun, start } from "workflow/api";

import {
  addRateLimitHeaders,
  checkRateLimit,
  createRateLimitError,
  getClientIpFromRequest,
} from "@/app/lib/rate-limit";
import { generateShowWorkflow } from "@/workflows/generate-show";

/**
 * POST: Start a new show generation workflow (non-blocking).
 * Returns the run ID immediately so client can poll for status.
 */
export async function POST(request: Request) {
  try {
    const clientIp = getClientIpFromRequest(request);
    const rateLimitResult = await checkRateLimit(clientIp, "generate-show");

    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        createRateLimitError(rateLimitResult),
        { status: 429 },
      );
      addRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const { showId } = await request.json();

    if (!showId) {
      return NextResponse.json(
        { error: "Missing required field: showId" },
        { status: 400 },
      );
    }

    const run = await start(generateShowWorkflow, [showId]);

    const response = NextResponse.json({
      message: "Show generation workflow started",
      runId: run.runId,
      status: "running",
    });
    addRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start workflow";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET: Poll for workflow status by run ID.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");

    if (!runId) {
      return NextResponse.json(
        { error: "Missing required query param: runId" },
        { status: 400 },
      );
    }

    const run = getRun(runId);
    const workflowStatus = await run.status;

    if (workflowStatus === "completed") {
      const result = await run.returnValue;
      return NextResponse.json({
        runId,
        status: "completed",
        success: (result as { success: boolean }).success,
        completedSteps: (result as { completedSteps: string[] }).completedSteps,
        result,
      });
    }

    if (workflowStatus === "failed") {
      const result = await run.returnValue;
      return NextResponse.json({
        runId,
        status: "failed",
        success: false,
        error: (result as { error?: string }).error,
      });
    }

    return NextResponse.json({
      runId,
      status: "running",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get workflow status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
