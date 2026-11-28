import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TRIGGER_POLL_QUEUE, TriggerPollJob } from '../../queue/queue.constants';
import { WorkflowEngine } from '../workflow-engine.service';

// Polls are network-bound, so one worker handles many at once. lockDuration outlives a slow
// provider call (30 s timeout) so BullMQ doesn't treat a busy job as stalled and re-run it.
@Processor(TRIGGER_POLL_QUEUE, { concurrency: Number(process.env.TRIGGER_POLL_CONCURRENCY ?? 25), lockDuration: 120_000 })
export class TriggerPollProcessor extends WorkerHost {
  constructor(private readonly engine: WorkflowEngine) {
    super();
  }

  async process(job: Job<TriggerPollJob>): Promise<void> {
    await this.engine.pollWorkflow(job.data.workflowId);
  }
}
