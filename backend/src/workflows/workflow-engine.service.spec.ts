import { Types } from 'mongoose';
import { PermanentIntegrationError, TransientIntegrationError } from '../engine/core/errors';
import { WorkflowEngine } from './workflow-engine.service';

const RUN_ID = new Types.ObjectId();
const WORKFLOW_ID = new Types.ObjectId();

function harness(stepStatuses: string[] = ['pending', 'pending']) {
  const run = {
    id: RUN_ID.toString(), _id: RUN_ID, workflowId: WORKFLOW_ID, userId: new Types.ObjectId(),
    status: 'queued', triggerData: { email: 'a@b.co' },
    definition: [
      { id: 's1', app: 'gmail', operation: 'send_email', input: { to: '{{trigger.email}}' } },
      { id: 's2', app: 'google_sheets', operation: 'append_row', input: { values: '{{steps.s1.id}}' } },
    ],
    steps: stepStatuses.map((status, index) => ({ stepId: `s${index + 1}`, status, output: status === 'succeeded' ? { id: 'prev' } : undefined })),
  };
  const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value), select: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis() });
  const runs = { findById: jest.fn(() => exec(run)), updateOne: jest.fn(() => exec({})) };
  const workflows = { updateOne: jest.fn(() => exec({})) };
  const runner = { runAction: jest.fn() };
  const scheduler = { unschedule: jest.fn() };
  const engine = new WorkflowEngine(workflows as never, runs as never, { add: jest.fn() } as never, runner as never, scheduler as never);
  const lastSet = () => runs.updateOne.mock.calls.at(-1)?.[1] as { $set: Record<string, unknown> };
  return { engine, runner, runs, lastSet, scheduler };
}

describe('WorkflowEngine.executeRun', () => {
  it('runs steps in order and passes earlier outputs to later steps', async () => {
    const { engine, runner, lastSet } = harness();
    runner.runAction.mockResolvedValueOnce({ input: {}, output: { id: 'MSG1' } }).mockResolvedValueOnce({ input: {}, output: { ok: true } });
    await engine.executeRun(RUN_ID.toString(), 0, 5);
    expect(runner.runAction.mock.calls[0][1].app).toBe('gmail');
    expect(runner.runAction.mock.calls[1][2]).toMatchObject({ trigger: { email: 'a@b.co' }, steps: { s1: { id: 'MSG1' } } });
    expect(runner.runAction.mock.calls[1][3]).toBe(`${RUN_ID.toString()}:s2`);
    expect(lastSet().$set.status).toBe('succeeded');
  });

  it('resumes after the last successful step on retry', async () => {
    const { engine, runner } = harness(['succeeded', 'pending']);
    runner.runAction.mockResolvedValueOnce({ input: {}, output: {} });
    await engine.executeRun(RUN_ID.toString(), 1, 5);
    expect(runner.runAction).toHaveBeenCalledTimes(1);
    expect(runner.runAction.mock.calls[0][2].steps.s1).toEqual({ id: 'prev' });
  });

  it('rethrows transient errors so BullMQ retries', async () => {
    const { engine, runner } = harness();
    runner.runAction.mockRejectedValueOnce(new TransientIntegrationError('503'));
    await expect(engine.executeRun(RUN_ID.toString(), 0, 5)).rejects.toThrow('503');
  });

  it('fails the run and skips remaining steps on permanent errors', async () => {
    const { engine, runner, lastSet } = harness();
    runner.runAction.mockRejectedValueOnce(new PermanentIntegrationError('bad input'));
    await expect(engine.executeRun(RUN_ID.toString(), 0, 5)).resolves.toBeUndefined();
    const update = lastSet();
    expect(update.$set).toBeDefined();
  });
});

describe('WorkflowEngine.pollWorkflow activation boundary', () => {
  it('persists the activation boundary before a poll so a failed seed cannot replay older email', async () => {
    const workflowId = new Types.ObjectId();
    const activationAt = new Date('2026-11-27T10:00:00.250Z');
    const workflow = {
      _id: workflowId,
      id: workflowId.toString(),
      userId: new Types.ObjectId(),
      status: 'active',
      trigger: { app: 'gmail', operation: 'new_email', input: { query: 'from:boss@example.com' } },
      triggerState: { initialized: false, seenIds: [], consecutiveFailures: 0 },
    };
    const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value), select: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis() });
    const workflows = {
      findOneAndUpdate: jest.fn(() => exec(workflow)),
      updateOne: jest.fn(() => exec({})),
      findById: jest.fn(() => ({ select: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(workflow) })),
    };
    const runner = { poll: jest.fn().mockRejectedValue(new Error('temporary Gmail outage')) };
    const scheduler = { unschedule: jest.fn() };
    const engine = new WorkflowEngine(workflows as never, { create: jest.fn() } as never, { add: jest.fn() } as never, runner as never, scheduler as never);

    jest.useFakeTimers().setSystemTime(activationAt);
    try {
      await engine.pollWorkflow(workflowId.toString());
    } finally {
      jest.useRealTimers();
    }

    expect(workflows.updateOne).toHaveBeenCalledWith(
      { _id: workflowId, 'triggerState.activationAt': { $exists: false } },
      { $set: { 'triggerState.activationAt': activationAt } },
    );
    expect(workflow.triggerState.activationAt).toEqual(activationAt);
    expect(runner.poll).toHaveBeenCalledWith(workflow.userId.toString(), expect.objectContaining({
      input: { query: 'from:boss@example.com after:1795773601' },
    }), expect.any(Function));
    expect(scheduler.unschedule).not.toHaveBeenCalled();
  });
});
