import { CommandResult } from "../types/CommandResult";
import { Task } from "../types/Task";

type AppState = {
  tasks: Task[];
  lastCommand: CommandResult | null;
};

export const state: AppState = {
  tasks: [] as Task[],
  lastCommand: null as CommandResult | null,
};

export const findTask = (taskId: string): Task | undefined => {
  return state.tasks.find((t) => t.id === taskId);
};
