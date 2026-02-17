import { describe, expect, it } from "vitest";
import { issueTaskId } from "../utils/idUtil";
import { getIsoTime } from "../utils/timeUtil";

describe("utils", () => {
  it("returns ISO timestamp string", () => {
    const iso = getIsoTime();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });

  it("issues task id with provided prefix", () => {
    const id = issueTaskId("task");
    expect(id).toMatch(/^task_[a-z0-9]+_[a-z0-9]{6}$/);
  });
});
