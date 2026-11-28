import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WORKFLOW_RUN_QUEUE, WorkflowRunJob } from '../../queue/queue.constants';
import { WorkflowEngine } from '../workflow-engine.service';

@Processor(WORKFLOW_RUN_QUEUE, { concurrency: Number(process.env.WORKFLOW_RUN_CONCURRENCY ?? 25), lockDuration: 120_000 })
export class WorkflowRunProcessor extends WorkerHost {
  constructor(private readonly engine: WorkflowEngine) {
    super();
  }

  async process(job: Job<WorkflowRunJob>): Promise<void> {
    await this.engine.executeRun(job.data.runId, job.attemptsMade, job.opts.attempts ?? 1);
  }
}
