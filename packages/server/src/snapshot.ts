import type {
  FeatureGateCondition,
  FeatureGateFlags,
  FeatureGateFlagValue,
  FeatureGateJsonObject,
  FeatureGateJsonPrimitive,
  FeatureGateRule,
} from "@featuregate/evaluation";

import type {
  RuntimeSnapshotCondition,
  RuntimeSnapshotFlag,
  RuntimeSnapshotResponse,
  RuntimeSnapshotRule,
} from "./types";

export function readSnapshotFlags(value: unknown): FeatureGateFlags {
  if (!isRuntimeSnapshotResponse(value)) {
    throw invalidSnapshot();
  }

  return Object.fromEntries(
    value.snapshot.flags.map((flag) => [
      flag.key,
      {
        defaultValue: flag.defaultValue,
        killSwitch: flag.killSwitch.active,
        rules: flag.rules.toSorted((left, right) => left.sortOrder - right.sortOrder).map(toRule),
      },
    ]),
  );
}

function toRule(rule: RuntimeSnapshotRule): FeatureGateRule {
  return {
    conditions: rule.conditions
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map(toCondition),
    conditionsMatch: rule.conditionsMatch,
    value: rule.serveValue,
  };
}

function toCondition(condition: RuntimeSnapshotCondition): FeatureGateCondition {
  if (condition.type === "percentage_rollout") {
    if (
      !condition.attributePath ||
      condition.rolloutPercentage === null ||
      !Number.isFinite(condition.rolloutPercentage) ||
      condition.rolloutPercentage < 0 ||
      condition.rolloutPercentage > 100
    ) {
      throw invalidSnapshot();
    }

    return {
      attributePath: condition.attributePath,
      percentage: condition.rolloutPercentage,
      type: "percentage_rollout",
    };
  }

  if (!condition.attributePath || !condition.operator) {
    throw invalidSnapshot();
  }

  if (condition.operator === "in" || condition.operator === "not_in") {
    if (!Array.isArray(condition.value)) {
      throw invalidSnapshot();
    }

    return {
      attributePath: condition.attributePath,
      operator: condition.operator,
      type: "attribute_match",
      value: condition.value,
    };
  }

  if (Array.isArray(condition.value)) {
    throw invalidSnapshot();
  }

  return {
    attributePath: condition.attributePath,
    operator: condition.operator,
    type: "attribute_match",
    value: condition.value,
  };
}

function isRuntimeSnapshotResponse(value: unknown): value is RuntimeSnapshotResponse {
  if (!isRecord(value) || !isRecord(value.snapshot) || !Array.isArray(value.snapshot.flags)) {
    return false;
  }

  return value.snapshot.flags.every(isRuntimeSnapshotFlag);
}

function isRuntimeSnapshotFlag(value: unknown): value is RuntimeSnapshotFlag {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    value.key.length > 0 &&
    isFlagValue(value.defaultValue) &&
    isRecord(value.killSwitch) &&
    typeof value.killSwitch.active === "boolean" &&
    Array.isArray(value.rules) &&
    value.rules.every(isRuntimeSnapshotRule)
  );
}

function isRuntimeSnapshotRule(value: unknown): value is RuntimeSnapshotRule {
  return (
    isRecord(value) &&
    Number.isInteger(value.sortOrder) &&
    (value.conditionsMatch === "all" || value.conditionsMatch === "any") &&
    isFlagValue(value.serveValue) &&
    Array.isArray(value.conditions) &&
    value.conditions.every(isRuntimeSnapshotCondition)
  );
}

function isRuntimeSnapshotCondition(value: unknown): value is RuntimeSnapshotCondition {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.sortOrder) ||
    (value.attributePath !== null && typeof value.attributePath !== "string")
  ) {
    return false;
  }

  if (value.type === "percentage_rollout") {
    return (
      value.operator === null &&
      value.value === null &&
      (value.rolloutPercentage === null || typeof value.rolloutPercentage === "number")
    );
  }

  return (
    value.type === "attribute_match" &&
    (value.operator === null ||
      value.operator === "equals" ||
      value.operator === "not_equals" ||
      value.operator === "in" ||
      value.operator === "not_in") &&
    value.rolloutPercentage === null &&
    (isJsonPrimitive(value.value) ||
      (Array.isArray(value.value) && value.value.every(isJsonPrimitive)))
  );
}

function isFlagValue(value: unknown): value is FeatureGateFlagValue {
  return (
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    isJsonObject(value)
  );
}

function isJsonObject(value: unknown): value is FeatureGateJsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): boolean {
  return (
    isJsonPrimitive(value) ||
    (Array.isArray(value) && value.every(isJsonValue)) ||
    (isRecord(value) && Object.values(value).every(isJsonValue))
  );
}

function invalidSnapshot(): Error {
  return new Error("FeatureGate returned an invalid snapshot response.");
}

function isJsonPrimitive(value: unknown): value is FeatureGateJsonPrimitive {
  return (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
