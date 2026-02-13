export type RepoPolicy = {
  project?: { name?: string };
  commands?: Record<string, string>;
  security?: {
    allow?: string[];
    forbid_raw_command?: boolean;
  };
};
