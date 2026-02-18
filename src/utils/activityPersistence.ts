import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ActivityEvent } from "../types/StoryWorkflow";

const resolveActivityLogPath = () => {
  const configured = process.env.COWAI_ACTIVITY_LOG_FILE;
  if (configured && configured.trim().length > 0) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
  return path.join(process.cwd(), "logs", "activity.ndjson");
};

export const activityLogFilePath = resolveActivityLogPath();

export const appendActivityEvent = async (event: ActivityEvent): Promise<void> => {
  try {
    await mkdir(path.dirname(activityLogFilePath), { recursive: true });
    await appendFile(activityLogFilePath, `${JSON.stringify(event)}\n`, "utf8");
  } catch {
    // Keep activity logging best-effort and non-fatal.
  }
};
