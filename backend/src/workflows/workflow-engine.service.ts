import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { AuthRequiredError, errorMessage, isRetryable } from '../engine/core/errors';
import { TriggerItem } from '../engine/core/integration.types';
import { TemplateScope } from '../engine/core/template';
import { StepRunner, StepRef } from '../integrations/step-runner.service';
import { WORKFLOW_RUN_QUEUE, WorkflowRunJob } from '../queue/queue.constants';
import { WorkflowRun, WorkflowRunDocument } from './schemas/workflow-run.schema';
import { Workflow, WorkflowDocument, WorkflowStep } from './schemas/workflow.schema';
import { TriggerScheduler } from './trigger-scheduler.service';

const POLL_LEASE_MS = 5 * 60 * 1000;
const MAX_NEW_ITEMS_PER_POLL = 50;
const SEEN_ID_CAP = 2000;
const MAX_POLL_FAILURES = 10;
const STUCK_RUN_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_INPUT_BYTES = 64 * 1024;

export function toStepRef(step: WorkflowStep): StepRef {
  return { app: step.app, operation: step.operation, connectionId: step.connectionId?.toString(), input: step.input ?? {} };
}

function limitSize(value: Record<string, unknown>, maxBytes: number): Record<string, unknown> {
  const json = JSON.stringify(value ?? {});
  if (Buffer.byteLength(json) <= maxBytes) return value ?? {};
  return { _truncated: true, preview: json.slice(0, Math.floor(maxBytes / 4)) };
}

/**
 * Execution engine.
 * - Trigger system: `pollWorkflow` detects new events and de-duplicates them.
 * - Execution: `executeRun` runs actions strictly in order, persisting each step so a
 *   retry resumes after the last successful step instead of repeating it.
 */
@Injectable()
export class WorkflowEngine {
  private readonly logger = new Logger(WorkflowEngine.name);

  constructor(
    @InjectModel(Workflow.name) private readonly workflows: Model<Workflow>,
    @InjectModel(WorkflowRun.name) private readonly runs: Model<WorkflowRun>,
    @InjectQueue(WORKFLOW_RUN_QUEUE) private readonly runQueue: Queue<WorkflowRunJob>,
    private readonly runner: StepRunner,
    private readonly scheduler: TriggerScheduler,
  ) {}

  async pollWorkflow(workflowId: string): Promise<void> {
    if (!Types.ObjectId.isValid(workflowId)) return;
    const now = new Date();
    const workflow = await this.workflows.findOneAndUpdate(
      {
        _id: workflowId,
        status: 'active',
        $or: [{ 'triggerState.pollLockUntil': { $exists: false } }, { 'triggerState.pollLockUntil': { $lte: now } }],
      },
      { $set: { 'triggerState.pollLockUntil': new Date(now.getTime() + POLL_LEASE_MS) } },
      { returnDocument: 'after' },
    ).exec();
    if (!workflow) {
      const current = await this.workflows.findById(workflowId).select('status').exec();
      if (!current || current.status !== 'active') await this.scheduler.unschedule(workflowId);
      return; // Otherwise another worker holds the lease.
    }

    try {
      // Backfill active workflows created before activationAt existed. Taking the
      // boundary before polling makes a failed first attempt safe to retry.
      const activationAt = workflow.triggerState.activationAt ?? now;
      if (!workflow.triggerState.activationAt) {
        await this.workflows.updateOne({ _id: workflow._id, 'triggerState.activationAt': { $exists: false } }, {
          $set: { 'triggerState.activationAt': activationAt },
        }).exec();
        workflow.triggerState.activationAt = activationAt;
      }
      const seeding = !workflow.triggerState.initialized;
      const seen = new Set(workflow.triggerState.seenIds);
      const triggerRef = toStepRef(workflow.trigger);
      const pollInput = withActivationBoundary(triggerRef, activationAt);
      const items = await this.runner.poll(
        workflow.userId.toString(),
        pollInput,
        seeding ? () => true : (id) => seen.has(id),
      );
      // Oldest first, so actions observe events in the order they happened.
      const fresh = seeding ? [] : items.filter((item) => !seen.has(item.id)).reverse().slice(0, MAX_NEW_ITEMS_PER_POLL);
      for (const item of fresh) await this.createRun(workflow, item, false);

      const handled = seeding ? items.map((item) => item.id) : [...fresh].reverse().map((item) => item.id);
      const seenIds = [...new Set([...handled, ...workflow.triggerState.seenIds])].slice(0, SEEN_ID_CAP);
      await this.workflows.updateOne({ _id: workflow._id }, {
        $set: {
          'triggerState.initialized': true,
          'triggerState.seenIds': seenIds,
          'triggerState.lastPolledAt': now,
          'triggerState.lastSuccessAt': now,
          'triggerState.consecutiveFailures': 0,
        },
        $unset: { 'triggerState.lastError': '', 'triggerState.pollLockUntil': '' },
      }).exec();
      if (fresh.length) this.logger.log(`Workflow ${workflow.id}: ${fresh.length} new trigger item(s)`);
      await this.requeueStuckRuns(workflow._id);
    } catch (error) {
      await this.recordPollFailure(workflow, error, now);
    }
  }

  /** Creates a durable run (idempotent per trigger item) and enqueues it. */
  async createRun(workflow: WorkflowDocument, item: TriggerItem, manual: boolean): Promise<WorkflowRunDocument | null> {
    let run: WorkflowRunDocument;
    try {
      run = await this.runs.create({
        workflowId: workflow._id,
        userId: workflow.userId,
        workflowRevision: workflow.revision,
        triggerItemId: item.id,
        triggerData: limitSize(item.data, MAX_OUTPUT_BYTES),
        definition: workflow.steps,
        steps: workflow.steps.map((step) => ({ stepId: step.id, app: step.app, operation: step.operation, status: 'pending', attempts: 0 })),
        status: 'queued',
        manual,
      });
    } catch (error) {
      if (isDuplicateKey(error)) return null; // Already handled by an earlier poll.
      throw error;
    }
    await this.enqueue(run.id as string);
    return run;
  }

  async executeRun(runId: string, attemptsMade: number, maxAttempts: number): Promise<void> {
    const run = await this.runs.findById(runId).exec();
    if (!run || run.status === 'succeeded' || run.status === 'failed') return;
    await this.runs.updateOne({ _id: run._id }, { $set: { status: 'running', startedAt: run.startedAt ?? new Date() } }).exec();

    const scope: TemplateScope = { trigger: run.triggerData ?? {}, steps: {} };
    for (const [index, step] of run.definition.entries()) {
      const record = run.steps[index];
      if (record?.status === 'succeeded') {
        scope.steps[step.id] = record.output ?? {};
        continue;
      }
      const path = `steps.${index}`;
      await this.runs.updateOne({ _id: run._id }, {
        $set: { [`${path}.status`]: 'running', [`${path}.startedAt`]: new Date() },
        $inc: { [`${path}.attempts`]: 1 },
      }).exec();
      try {
        const { input, output } = await this.runner.runAction(run.userId.toString(), toStepRef(step), scope, `${run.id}:${step.id}`);
        scope.steps[step.id] = output;
        await this.runs.updateOne({ _id: run._id }, {
          $set: {
            [`${path}.status`]: 'succeeded',
            [`${path}.input`]: limitSize(input, MAX_INPUT_BYTES),
            [`${path}.output`]: limitSize(output, MAX_OUTPUT_BYTES),
            [`${path}.finishedAt`]: new Date(),
          },
          $unset: { [`${path}.error`]: '' },
        }).exec();
      } catch (error) {
        const message = errorMessage(error);
        const final = !isRetryable(error) || attemptsMade + 1 >= maxAttempts;
        await this.runs.updateOne({ _id: run._id }, {
          $set: { [`${path}.status`]: final ? 'failed' : 'pending', [`${path}.error`]: message, [`${path}.finishedAt`]: new Date() },
        }).exec();
        if (!final) throw error; // BullMQ retries with exponential backoff and resumes here.
        await this.failRun(run, index, step, message);
        if (error instanceof AuthRequiredError) await this.disableWorkflow(run.workflowId, message);
        return;
      }
    }

    const finishedAt = new Date();
    await this.runs.updateOne({ _id: run._id }, { $set: { status: 'succeeded', finishedAt }, $unset: { error: '' } }).exec();
    await this.workflows.updateOne({ _id: run.workflowId }, { $set: { lastRunAt: finishedAt } }).exec();
  }

  private async failRun(run: WorkflowRunDocument, failedIndex: number, step: WorkflowStep, message: string) {
    const skipped = Object.fromEntries(
      run.definition.slice(failedIndex + 1).map((_, offset) => [`steps.${failedIndex + 1 + offset}.status`, 'skipped']),
    );
    const finishedAt = new Date();
    await this.runs.updateOne({ _id: run._id }, {
      $set: { ...skipped, status: 'failed', error: `Step "${step.id}" (${step.app}.${step.operation}) failed: ${message}`.slice(0, 1000), finishedAt },
    }).exec();
    await this.workflows.updateOne({ _id: run.workflowId }, { $set: { lastRunAt: finishedAt } }).exec();
  }

  private async recordPollFailure(workflow: WorkflowDocument, error: unknown, now: Date) {
    const message = errorMessage(error);
    const failures = workflow.triggerState.consecutiveFailures + 1;
    const disable = error instanceof AuthRequiredError || failures >= MAX_POLL_FAILURES;
    this.logger.warn(`Workflow ${workflow.id} poll failed (${failures}): ${message}`);
    await this.workflows.updateOne({ _id: workflow._id }, {
      $set: {
        'triggerState.lastPolledAt': now,
        'triggerState.lastError': message,
        'triggerState.consecutiveFailures': failures,
        ...(disable ? { status: 'error', statusReason: error instanceof AuthRequiredError ? message : `Trigger failed ${failures} times in a row: ${message}` } : {}),
      },
      $unset: { 'triggerState.pollLockUntil': '' },
    }).exec();
    if (disable) await this.scheduler.unschedule(workflow.id as string);
  }

  private async disableWorkflow(workflowId: Types.ObjectId, reason: string) {
    await this.workflows.updateOne({ _id: workflowId, status: 'active' }, { $set: { status: 'error', statusReason: reason } }).exec();
    await this.scheduler.unschedule(workflowId.toString());
  }

  /** Runs saved but never enqueued (e.g. Redis outage between the two writes). */
  private async requeueStuckRuns(workflowId: Types.ObjectId) {
    const stuck = await this.runs.find({ workflowId, status: 'queued', createdAt: { $lt: new Date(Date.now() - STUCK_RUN_MS) } })
      .select('_id').limit(50).exec();
    for (const run of stuck) await this.enqueue(run.id as string);
  }

  private async enqueue(runId: string) {
    // Deterministic job id: BullMQ ignores duplicates while the job exists.
    await this.runQueue.add('run', { runId }, { jobId: `run-${runId}` });
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: number }).code === 11000;
}

/** Gmail supports after: searches, so enforce activation time even if initial seeding fails. */
function withActivationBoundary(step: StepRef, activationAt?: Date): StepRef {
  if (!activationAt || step.app !== 'gmail' || step.operation !== 'new_email') return step;
  // Gmail's `after:` boundary has whole-second precision. Rounding up avoids
  // treating messages in the activation second as new.
  const afterSeconds = Math.ceil(activationAt.getTime() / 1000);
  const input = step.input ?? {};
  const query = String(input.query ?? '').trim();
  return { ...step, input: { ...input, query: [query, `after:${afterSeconds}`].filter(Boolean).join(' ') } };
}
