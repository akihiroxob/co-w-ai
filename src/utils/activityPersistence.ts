import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ActivityEvent } from "../types/StoryWorkflow";

export const activityLogFilePath = path.join(process.cwd(), "logs", "activity.ndjson");

export const appendActivityEvent = async (event: ActivityEvent): Promise<void> => {
  try {
    await mkdir(path.dirname(activityLogFilePath), { recursive: true });
    await appendFile(activityLogFilePath, `${JSON.stringify(event)}\n`, "utf8");
  } catch {
    // Keep activity logging best-effort and non-fatal.
  }
};
