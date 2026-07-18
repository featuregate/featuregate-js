import type { FeatureGateCondition, FeatureGateRule } from "@featuregate/evaluation";
import type { z } from "zod/v4";

import { FeatureGateConfigurationError } from "./errors";
import {
  runtimeSnapshotConditionSchema,
  runtimeSnapshotResponseSchema,
  runtimeSnapshotRuleSchema,
} from "./schema";
import type { FeatureGateConfigurationSnapshot } from "./types";

export function readSnapshot(value: unknown): FeatureGateConfigurationSnapshot {
  const result = runtimeSnapshotResponseSchema.safeParse(value);

  if (!result.success) {
    throw new FeatureGateConfigurationError(
      "FeatureGate returned an invalid snapshot response.",
      undefined,
      { cause: result.error },
    );
  }

  return {
    flags: Object.fromEntries(
      result.data.snapshot.flags.map((flag) => [
        flag.key,
        {
          defaultValue: flag.defaultValue,
          killSwitch: flag.killSwitch.active,
          rules: flag.rules
            .toSorted((left, right) => left.sortOrder - right.sortOrder)
            .map(toRule)
            .filter((rule) => rule !== undefined),
        },
      ]),
    ),
    version: result.data.snapshot.version,
  };
}

type RuntimeSnapshotRule = z.infer<typeof runtimeSnapshotRuleSchema>;

function toRule(rule: RuntimeSnapshotRule): FeatureGateRule | undefined {
  const conditions = rule.conditions
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map(toCondition);

  // A non-evaluable condition makes an `all` rule impossible. For `any`, valid conditions can
  // still match independently, so only the non-evaluable conditions are omitted.
  if (rule.conditionsMatch === "all" && conditions.includes(undefined)) {
    return undefined;
  }

  return {
    conditions: conditions.filter((condition) => condition !== undefined),
    conditionsMatch: rule.conditionsMatch,
    value: rule.serveValue,
  };
}

type RuntimeSnapshotCondition = z.infer<typeof runtimeSnapshotConditionSchema>;

function toCondition(condition: RuntimeSnapshotCondition): FeatureGateCondition | undefined {
  if (condition.type === "percentage_rollout") {
    if (!condition.attributePath || condition.rolloutPercentage === null) {
      return undefined;
    }

    return {
      attributePath: condition.attributePath,
      percentage: condition.rolloutPercentage,
      type: "percentage_rollout",
    };
  }

  if (!condition.attributePath || !condition.operator) {
    return undefined;
  }

  if (condition.operator === "in" || condition.operator === "not_in") {
    if (!Array.isArray(condition.value)) {
      return undefined;
    }

    return {
      attributePath: condition.attributePath,
      operator: condition.operator,
      type: "attribute_match",
      value: condition.value,
    };
  }

  if (Array.isArray(condition.value)) {
    return undefined;
  }

  return {
    attributePath: condition.attributePath,
    operator: condition.operator,
    type: "attribute_match",
    value: condition.value,
  };
}
