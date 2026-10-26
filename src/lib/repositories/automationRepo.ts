import type { PrismaClient, Prisma } from '../../generated/prisma/client';
import type { AutomationRule } from '@/types';

type AutomationRow = Prisma.AutomationRuleGetPayload<{ include: { actions: true } }>;

function toApiAutomation(row: AutomationRow): AutomationRule {
  return {
    id: row.id,
    name: row.name,
    triggerEvent: row.triggerEvent as AutomationRule['triggerEvent'],
    conditionChannel: (row.conditionChannel ?? undefined) as AutomationRule['conditionChannel'],
    conditionKeyword: row.conditionKeyword ?? undefined,
    actions: [...row.actions]
      .sort((a, b) => a.position - b.position)
      .map((a) => ({ type: a.type as AutomationRule['actions'][number]['type'], targetValue: a.targetValue })),
    enabled: row.enabled,
    triggerCount: row.triggerCount,
    lastTriggered: row.lastTriggered ?? undefined,
  };
}

type AutomationInput = Partial<AutomationRule>;

function scalarData(input: AutomationInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.triggerEvent !== undefined) data.triggerEvent = input.triggerEvent;
  if (input.conditionChannel !== undefined) data.conditionChannel = input.conditionChannel;
  if (input.conditionKeyword !== undefined) data.conditionKeyword = input.conditionKeyword;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.triggerCount !== undefined) data.triggerCount = input.triggerCount;
  if (input.lastTriggered !== undefined) data.lastTriggered = input.lastTriggered;
  return data;
}

async function replaceActions(
  db: PrismaClient,
  ruleId: string,
  actions: AutomationRule['actions']
): Promise<void> {
  await db.automationAction.deleteMany({ where: { ruleId } });
  if (actions.length === 0) return;
  await db.automationAction.createMany({
    data: actions.map((a, i) => ({ ruleId, type: a.type, targetValue: a.targetValue, position: i })),
  });
}

export async function listAutomations(db: PrismaClient): Promise<AutomationRule[]> {
  const rows = await db.automationRule.findMany({ include: { actions: true }, orderBy: { createdAt: 'desc' } });
  return rows.map(toApiAutomation);
}

export async function getAutomation(db: PrismaClient, id: string): Promise<AutomationRule | null> {
  const row = await db.automationRule.findUnique({ where: { id }, include: { actions: true } });
  return row ? toApiAutomation(row) : null;
}

export async function upsertAutomation(
  db: PrismaClient,
  id: string,
  input: AutomationInput
): Promise<AutomationRule> {
  const scalar = scalarData(input);
  await db.automationRule.upsert({
    where: { id },
    update: scalar as Prisma.AutomationRuleUpdateInput,
    create: {
      ...(scalar as Prisma.AutomationRuleUncheckedCreateInput),
      id,
      name: input.name ?? id,
      triggerEvent: input.triggerEvent ?? 'message_received',
    },
  });
  if (input.actions !== undefined) await replaceActions(db, id, input.actions);

  const row = await db.automationRule.findUnique({ where: { id }, include: { actions: true } });
  return toApiAutomation(row as AutomationRow);
}

export async function updateAutomation(
  db: PrismaClient,
  id: string,
  input: AutomationInput
): Promise<AutomationRule | null> {
  const exists = await db.automationRule.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return null;

  await db.automationRule.update({ where: { id }, data: scalarData(input) as Prisma.AutomationRuleUpdateInput });
  if (input.actions !== undefined) await replaceActions(db, id, input.actions);

  const row = await db.automationRule.findUnique({ where: { id }, include: { actions: true } });
  return toApiAutomation(row as AutomationRow);
}

export async function deleteAutomation(db: PrismaClient, id: string): Promise<void> {
  await db.automationRule.delete({ where: { id } }).catch(() => null);
}
