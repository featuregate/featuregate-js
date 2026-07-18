import { z } from "zod/v4";

const jsonPrimitiveSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const flagValueSchema = z.union([
  z.boolean(),
  z.string(),
  z.number().finite(),
  z.record(z.string(), z.json()),
]);

const conditionBase = {
  attributePath: z.string().min(1),
  rolloutPercentage: z.null(),
  sortOrder: z.number().int(),
  type: z.literal("attribute_match"),
};

const attributeConditionSchema = z.discriminatedUnion("operator", [
  z.object({
    ...conditionBase,
    operator: z.literal("equals"),
    value: jsonPrimitiveSchema,
  }),
  z.object({
    ...conditionBase,
    operator: z.literal("not_equals"),
    value: jsonPrimitiveSchema,
  }),
  z.object({
    ...conditionBase,
    operator: z.literal("in"),
    value: z.array(jsonPrimitiveSchema),
  }),
  z.object({
    ...conditionBase,
    operator: z.literal("not_in"),
    value: z.array(jsonPrimitiveSchema),
  }),
]);

const percentageConditionSchema = z.object({
  attributePath: z.string().min(1),
  operator: z.null(),
  rolloutPercentage: z.number().min(0).max(100),
  sortOrder: z.number().int(),
  type: z.literal("percentage_rollout"),
  value: z.null(),
});

export const runtimeSnapshotConditionSchema = z.union([
  attributeConditionSchema,
  percentageConditionSchema,
]);

export const runtimeSnapshotRuleSchema = z.object({
  conditions: z.array(runtimeSnapshotConditionSchema),
  conditionsMatch: z.enum(["all", "any"]),
  serveValue: flagValueSchema,
  sortOrder: z.number().int(),
});

const runtimeSnapshotFlagSchema = z.object({
  defaultValue: flagValueSchema,
  key: z.string().min(1),
  killSwitch: z.object({ active: z.boolean() }),
  rules: z.array(runtimeSnapshotRuleSchema),
});

export const runtimeSnapshotResponseSchema = z.object({
  snapshot: z.object({
    flags: z.array(runtimeSnapshotFlagSchema),
    version: z.string().min(1),
  }),
});
