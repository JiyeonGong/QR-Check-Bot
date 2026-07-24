import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";
import type { CohortConfig } from "./types.js";

export type CohortRegistry = {
  cohorts: CohortConfig[];
  registeredManagerIds: Set<string>;
  cohortsByManagerId: Map<string, CohortConfig[]>;
  cohortByParentChannelId: Map<string, CohortConfig>;
};

export function loadCohortRegistry(): CohortRegistry {
  const configPath = resolve(config.cohortsConfigPath);
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as CohortConfig[];
  const cohorts = parsed
    .filter((cohort) => cohort.active)
    .map((cohort) => ({
      ...cohort,
      discordParentChannelId: String(cohort.discordParentChannelId),
      discordParentChannelName: String(cohort.discordParentChannelName),
      managerIds: cohort.managerIds.map(String),
    }));

  if (cohorts.length === 0) {
    throw new Error("At least one active cohort is required");
  }

  const registeredManagerIds = new Set<string>();
  const cohortsByManagerId = new Map<string, CohortConfig[]>();
  const cohortByParentChannelId = new Map<string, CohortConfig>();

  for (const cohort of cohorts) {
    cohortByParentChannelId.set(cohort.discordParentChannelId, cohort);

    for (const managerId of cohort.managerIds) {
      registeredManagerIds.add(managerId);
      const managerCohorts = cohortsByManagerId.get(managerId) ?? [];
      managerCohorts.push(cohort);
      cohortsByManagerId.set(managerId, managerCohorts);
    }
  }

  return {
    cohorts,
    registeredManagerIds,
    cohortsByManagerId,
    cohortByParentChannelId,
  };
}
