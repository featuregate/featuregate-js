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
          rules: flag.rules.toSorted((left, right) => left.sortOrder - right.sortOrder).map(toRule),
        },
      ]),
    ),
    version: result.data.snapshot.version,
  };
}

type RuntimeSnapshotRule = z.infer<typeof runtimeSnapshotRuleSchema>;

function toRule(rule: RuntimeSnapshotRule): FeatureGateRule {
  return {
    conditions: rule.conditions
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map(toCondition),
    conditionsMatch: rule.conditionsMatch,
    value: rule.serveValue,
  };
}

type RuntimeSnapshotCondition = z.infer<typeof runtimeSnapshotConditionSchema>;

function toCondition(condition: RuntimeSnapshotCondition): FeatureGateCondition {
  if (condition.type === "percentage_rollout") {
    return {
      attributePath: condition.attributePath,
      percentage: condition.rolloutPercentage,
      type: "percentage_rollout",
    };
  }

  if (condition.operator === "in" || condition.operator === "not_in") {
    return {
      attributePath: condition.attributePath,
      operator: condition.operator,
      type: "attribute_match",
      value: condition.value,
    };
  }

  return {
    attributePath: condition.attributePath,
    operator: condition.operator,
    type: "attribute_match",
    value: condition.value,
  };
}
