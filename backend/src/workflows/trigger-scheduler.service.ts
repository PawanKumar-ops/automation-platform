import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { createHash } from 'node:crypto';
import { TRIGGER_POLL_QUEUE, TriggerPollJob } from '../queue/queue.constants';
import { runsWorkers } from './process-role';
import { Workflow } from './schemas/workflow.schema';

/** Owns the BullMQ job scheduler (repeatable poll) of every active workflow. */
@Injectable()
export class TriggerScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(TriggerScheduler.name);

  constructor(
    @InjectQueue(TRIGGER_POLL_QUEUE) private readonly queue: Queue<TriggerPollJob>,
    @InjectModel(Workflow.name) private readonly workflows: Model<Workflow>,
  ) {}

  /**
   * Polls each workflow on its own fixed phase inside the interval (like Zapier), so
   * thousands of workflows are spread evenly instead of all firing at the same instant
   * after a deploy or a burst of activations. The phase is derived from the id, so
   * re-scheduling the same workflow keeps its slot.
   */
  async schedule(workflow: { id: string; pollIntervalSeconds: number }) {
    const every = workflow.pollIntervalSeconds * 1000;
    const phase = createHash('sha1').update(workflow.id).digest().readUInt32BE(0) % every;
    const now = Date.now();
    let start = Math.floor(now / every) * every + phase;
    if (start <= now) start += every;
    await this.queue.upsertJobScheduler(
      schedulerId(workflow.id),
      { every, startDate: new Date(start) },
      { name: 'poll', data: { workflowId: workflow.id }, opts: { removeOnComplete: { count: 200 }, removeOnFail: { count: 1000 } } },
    );
  }

  async unschedule(workflowId: string) {
    await this.queue.removeJobScheduler(schedulerId(workflowId));
  }

  /** Immediate poll (used on activation to record existing items right away). */
  async pollNow(workflowId: string) {
    await this.queue.add('poll', { workflowId }, { jobId: `poll-now-${workflowId}-${Date.now()}` });
  }

  /** Re-creates schedulers after a Redis flush or deploy, so Mongo stays the source of truth. */
  async onApplicationBootstrap() {
    if (!runsWorkers() || process.env.SCHEDULER_RECONCILE === 'false') return;
    try {
      let count = 0;
      let batch: Promise<void>[] = [];
      for await (const workflow of this.workflows.find({ status: 'active' }).select('_id pollIntervalSeconds').lean().cursor()) {
        batch.push(this.schedule({ id: String(workflow._id), pollIntervalSeconds: workflow.pollIntervalSeconds }));
        count += 1;
        // Bounded parallelism keeps a large reconcile fast without flooding Redis.
        if (batch.length >= 100) { await Promise.all(batch); batch = []; }
      }
      await Promise.all(batch);
      this.logger.log(`Reconciled ${count} active workflow schedule(s)`);
    } catch (error) {
      this.logger.error(`Schedule reconciliation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}

function schedulerId(workflowId: string) {
  return `workflow-${workflowId}`;
}
