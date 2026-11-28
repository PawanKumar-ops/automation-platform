import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { isValidObjectId, Model, Types } from 'mongoose';
import { ConnectionsService } from '../connections/connections.service';
import { AppRegistry } from '../engine/core/app-registry';
import { validateConfiguredInput } from '../engine/core/input';
import { containsTemplate, referencedStepIds } from '../engine/core/template';
import { interactive } from '../integrations/http-errors';
import { StepRunner } from '../integrations/step-runner.service';
import { CreateWorkflowDto, UpdateWorkflowDto, WorkflowStepDto } from './dto/workflow.dto';
import { WorkflowRun } from './schemas/workflow-run.schema';
import { Workflow, WorkflowDocument, WorkflowStep } from './schemas/workflow.schema';
import { TriggerScheduler } from './trigger-scheduler.service';
import { toStepRef, WorkflowEngine } from './workflow-engine.service';

/** Fair-use cap on workflows a single user can have turned on (like Zapier plan limits). */
const MAX_ACTIVE_PER_USER = Number(process.env.MAX_ACTIVE_WORKFLOWS_PER_USER ?? 100);

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectModel(Workflow.name) private readonly workflows: Model<Workflow>,
    @InjectModel(WorkflowRun.name) private readonly runs: Model<WorkflowRun>,
    private readonly registry: AppRegistry,
    private readonly connections: ConnectionsService,
    private readonly scheduler: TriggerScheduler,
    private readonly engine: WorkflowEngine,
    private readonly runner: StepRunner,
  ) {}

  async list(userId: string) {
    const items = await this.workflows.find({ userId: new Types.ObjectId(userId) }).sort({ updatedAt: -1 }).limit(200).exec();
    return items.map(present);
  }

  async get(userId: string, id: string) {
    return present(await this.findOwned(userId, id));
  }

  async create(userId: string, dto: CreateWorkflowDto) {
    const steps = (dto.steps ?? []).map(toStep);
    const trigger = dto.trigger ? toStep(dto.trigger) : undefined;
    if (trigger) this.validateStructure(trigger, steps);
    const workflow = await this.workflows.create({
      userId: new Types.ObjectId(userId),
      name: dto.name.trim(),
      status: 'draft',
      ...(trigger ? { trigger } : {}),
      steps: trigger ? steps : [],
      ...(dto.canvas ? { canvas: dto.canvas } : {}),
      pollIntervalSeconds: dto.pollIntervalSeconds ?? 120,
    });
    return present(workflow);
  }

  async update(userId: string, id: string, dto: UpdateWorkflowDto) {
    const workflow = await this.findOwned(userId, id);
    const trigger = dto.trigger === null ? undefined : dto.trigger ? toStep(dto.trigger) : workflow.trigger;
    const steps = trigger ? (dto.steps ? dto.steps.map(toStep) : workflow.steps) : [];
    if (!trigger && workflow.status === 'active') throw new BadRequestException('Pause this workflow before removing its trigger');
    if (trigger) this.validateStructure(trigger, steps);
    if (trigger && workflow.status === 'active') await this.validateForActivation(userId, trigger, steps);

    const triggerChanged = dto.trigger !== undefined &&
      JSON.stringify(workflow.trigger ? toComparable(workflow.trigger) : null) !== JSON.stringify(trigger ? toComparable(trigger) : null);
    workflow.set({
      ...(dto.name ? { name: dto.name.trim() } : {}),
      trigger,
      steps,
      ...(dto.canvas ? { canvas: dto.canvas } : {}),
      ...(dto.pollIntervalSeconds ? { pollIntervalSeconds: dto.pollIntervalSeconds } : {}),
      revision: workflow.revision + 1,
      // A different trigger watches a different source: start fresh without replaying history.
      ...(triggerChanged ? { triggerState: { initialized: false, seenIds: [], consecutiveFailures: 0, ...(workflow.status === 'active' ? { activationAt: new Date() } : {}) } } : {}),
    });
    await workflow.save();
    if (workflow.status === 'active') {
      await this.scheduler.schedule({ id: workflow.id as string, pollIntervalSeconds: workflow.pollIntervalSeconds });
      if (triggerChanged) await this.scheduler.pollNow(workflow.id as string);
    }
    return present(workflow);
  }

  async remove(userId: string, id: string) {
    const workflow = await this.findOwned(userId, id);
    await this.scheduler.unschedule(workflow.id as string);
    await this.workflows.deleteOne({ _id: workflow._id, userId: workflow.userId }).exec();
    await this.runs.deleteMany({ workflowId: workflow._id, userId: workflow.userId }).exec();
    return { id: workflow.id as string, deleted: true };
  }

  /** Turns the workflow on. Only events after this activation boundary can start runs. */
  async activate(userId: string, id: string) {
    const workflow = await this.findOwned(userId, id);
    if (workflow.status !== 'active') {
      const activeCount = await this.workflows.countDocuments({ userId: workflow.userId, status: 'active' }).exec();
      if (activeCount >= MAX_ACTIVE_PER_USER) {
        throw new BadRequestException({ message: [`You can have up to ${MAX_ACTIVE_PER_USER} workflows turned on. Stop one to publish this.`], code: 'ACTIVE_LIMIT' });
      }
    }
    await this.validateForActivation(userId, requireTrigger(workflow), workflow.steps);
    workflow.set({
      status: 'active',
      statusReason: undefined,
      triggerState: { initialized: false, seenIds: [], consecutiveFailures: 0, activationAt: new Date() },
    });
    await workflow.save();
    await this.scheduler.schedule({ id: workflow.id as string, pollIntervalSeconds: workflow.pollIntervalSeconds });
    await this.scheduler.pollNow(workflow.id as string);
    return present(workflow);
  }

  async pause(userId: string, id: string) {
    const workflow = await this.findOwned(userId, id);
    // Unschedule first so no new poll starts; a check already in progress just finishes.
    await this.scheduler.unschedule(workflow.id as string);
    workflow.set({ status: 'paused', statusReason: undefined });
    await workflow.save();
    return present(workflow);
  }

  /** Runs the actions once with the most recent real trigger item (like Zapier's "Test"). */
  async runNow(userId: string, id: string) {
    const workflow = await this.findOwned(userId, id);
    const trigger = requireTrigger(workflow);
    await this.validateForActivation(userId, trigger, workflow.steps);
    const items = await interactive(() => this.runner.poll(userId, toStepRef(trigger)));
    const latest = items[0];
    if (!latest) throw new UnprocessableEntityException('No trigger data found yet. Create a matching event in the app and try again.');
    const run = await this.engine.createRun(workflow, { id: `manual:${randomUUID()}`, data: latest.data }, true);
    return run ? presentRun(run) : null;
  }

  async listRuns(userId: string, id: string, limit = 25) {
    const workflow = await this.findOwned(userId, id);
    const runs = await this.runs.find({ workflowId: workflow._id, userId: workflow.userId })
      .sort({ createdAt: -1 }).limit(limit).select('-definition -triggerData -steps.input -steps.output').exec();
    return runs.map(presentRun);
  }

  async getRun(userId: string, id: string, runId: string) {
    const workflow = await this.findOwned(userId, id);
    if (!isValidObjectId(runId)) throw new NotFoundException('Run not found');
    const run = await this.runs.findOne({ _id: runId, workflowId: workflow._id, userId: workflow.userId }).exec();
    if (!run) throw new NotFoundException('Run not found');
    return presentRun(run);
  }

  /** Structural checks (drafts may still have empty fields). */
  private validateStructure(trigger: WorkflowStepDto | WorkflowStep, steps: (WorkflowStepDto | WorkflowStep)[]) {
    const problems: string[] = [];
    try {
      const { trigger: definition } = this.registry.getTrigger(trigger.app, trigger.operation);
      if (definition.type !== 'polling') problems.push(`${definition.name} (instant triggers) is not supported yet`);
      if (Object.values(trigger.input ?? {}).some(containsTemplate)) problems.push('Trigger fields cannot use mapped values');
    } catch (error) {
      problems.push(error instanceof Error ? error.message : 'Unknown trigger');
    }
    const earlier = new Set<string>();
    for (const step of steps) {
      if (step.id === 'trigger' || earlier.has(step.id)) problems.push(`Step id "${step.id}" is reserved or duplicated`);
      try {
        this.registry.getAction(step.app, step.operation);
      } catch (error) {
        problems.push(error instanceof Error ? error.message : 'Unknown action');
      }
      for (const ref of referencedStepIds(step.input ?? {})) {
        if (!earlier.has(ref)) problems.push(`Step "${step.id}" uses data from "${ref}", which does not run before it`);
      }
      earlier.add(step.id);
    }
    if (problems.length) throw new BadRequestException({ message: problems, code: 'INVALID_WORKFLOW' });
  }

  /** Everything needed to run: fields, accounts, and granted permissions. */
  private async validateForActivation(userId: string, trigger: WorkflowStep, steps: WorkflowStep[]) {
    this.validateStructure(trigger, steps);
    const problems: string[] = [];
    if (!steps.length) problems.push('Add at least one action');
    const checks: { label: string; step: WorkflowStep; fields: ReturnType<AppRegistry['getTrigger']>['trigger']['inputFields'] }[] = [
      { label: 'Trigger', step: trigger, fields: this.registry.getTrigger(trigger.app, trigger.operation).trigger.inputFields },
      ...steps.map((step, index) => ({ label: `Step ${index + 1}`, step, fields: this.registry.getAction(step.app, step.operation).action.inputFields })),
    ];
    for (const { label, step, fields } of checks) {
      validateConfiguredInput(fields, step.input ?? {}).forEach((problem) => problems.push(`${label}: ${problem}`));
      const app = this.registry.getApp(step.app);
      if (app.auth.type === 'oauth2') {
        if (!step.connectionId) {
          problems.push(`${label}: choose a ${app.name} account`);
          continue;
        }
        try {
          await this.connections.assertUsable(userId, step.connectionId.toString(), app.auth.provider, app.auth.scopes);
        } catch (error) {
          problems.push(`${label}: ${error instanceof Error ? error.message : 'account unavailable'}`);
        }
      }
    }
    if (problems.length) throw new BadRequestException({ message: problems, code: 'INVALID_WORKFLOW' });
  }

  private async findOwned(userId: string, id: string): Promise<WorkflowDocument> {
    if (!isValidObjectId(id)) throw new NotFoundException('Workflow not found');
    const workflow = await this.workflows.findOne({ _id: id, userId: new Types.ObjectId(userId) }).exec();
    if (!workflow) throw new NotFoundException('Workflow not found');
    return workflow;
  }
}

function requireTrigger(workflow: WorkflowDocument): WorkflowStep {
  if (!workflow.trigger) throw new BadRequestException({ message: ['Choose a trigger to start this workflow'], code: 'INVALID_WORKFLOW' });
  return workflow.trigger;
}

function toStep(dto: WorkflowStepDto | WorkflowStep): WorkflowStep {
  return {
    id: dto.id,
    app: dto.app,
    operation: dto.operation,
    ...(dto.connectionId ? { connectionId: new Types.ObjectId(dto.connectionId.toString()) } : {}),
    input: dto.input ?? {},
  };
}

function toComparable(step: WorkflowStep) {
  return { app: step.app, operation: step.operation, connectionId: step.connectionId?.toString(), input: step.input };
}

function presentStep(step: WorkflowStep) {
  return { id: step.id, app: step.app, operation: step.operation, connectionId: step.connectionId?.toString() ?? null, input: step.input ?? {} };
}

function present(workflow: WorkflowDocument) {
  const state = workflow.triggerState;
  return {
    id: workflow.id as string,
    name: workflow.name,
    status: workflow.status,
    statusReason: workflow.statusReason ?? null,
    trigger: workflow.trigger ? presentStep(workflow.trigger) : null,
    steps: workflow.steps.map(presentStep),
    pollIntervalSeconds: workflow.pollIntervalSeconds,
    revision: workflow.revision,
    lastRunAt: workflow.lastRunAt ?? null,
    canvas: workflow.canvas ?? null,
    triggerState: {
      initialized: state?.initialized ?? false,
      lastPolledAt: state?.lastPolledAt ?? null,
      lastSuccessAt: state?.lastSuccessAt ?? null,
      lastError: state?.lastError ?? null,
      consecutiveFailures: state?.consecutiveFailures ?? 0,
    },
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
}

function presentRun(run: { id?: unknown; workflowId: Types.ObjectId } & Partial<WorkflowRun>) {
  return {
    id: String(run.id),
    workflowId: run.workflowId.toString(),
    status: run.status,
    manual: run.manual ?? false,
    triggerItemId: run.triggerItemId,
    triggerData: run.triggerData,
    steps: run.steps,
    error: run.error ?? null,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    createdAt: run.createdAt,
  };
}
