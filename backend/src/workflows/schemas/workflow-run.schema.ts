import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { WorkflowStep, WorkflowStepSchema } from './workflow.schema';

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

@Schema({ _id: false, versionKey: false })
export class RunStep {
  @Prop({ required: true })
  stepId!: string;

  @Prop({ required: true })
  app!: string;

  @Prop({ required: true })
  operation!: string;

  @Prop({ required: true, enum: ['pending', 'running', 'succeeded', 'failed', 'skipped'], default: 'pending' })
  status!: StepStatus;

  @Prop({ default: 0 })
  attempts!: number;

  @Prop({ type: MongooseSchema.Types.Mixed })
  input?: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  output?: Record<string, unknown>;

  @Prop({ maxlength: 1000 })
  error?: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  finishedAt?: Date;
}
export const RunStepSchema = SchemaFactory.createForClass(RunStep);

export type WorkflowRunDocument = HydratedDocument<WorkflowRun>;

@Schema({ timestamps: true, versionKey: false })
export class WorkflowRun {
  createdAt!: Date;
  updatedAt!: Date;

  @Prop({ type: Types.ObjectId, ref: 'Workflow', required: true })
  workflowId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  workflowRevision!: number;

  /** Trigger item id; unique per workflow so an event never runs twice. */
  @Prop({ required: true, maxlength: 600 })
  triggerItemId!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  triggerData!: Record<string, unknown>;

  /** Snapshot of the actions at trigger time, so edits never affect in-flight runs. */
  @Prop({ type: [WorkflowStepSchema], default: [] })
  definition!: WorkflowStep[];

  @Prop({ type: [RunStepSchema], default: [] })
  steps!: RunStep[];

  @Prop({ required: true, enum: ['queued', 'running', 'succeeded', 'failed'], default: 'queued', index: true })
  status!: RunStatus;

  @Prop({ default: false })
  manual!: boolean;

  @Prop({ maxlength: 1000 })
  error?: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  finishedAt?: Date;
}

export const WorkflowRunSchema = SchemaFactory.createForClass(WorkflowRun);
WorkflowRunSchema.index({ workflowId: 1, triggerItemId: 1 }, { unique: true, name: 'unique_workflow_item' });
WorkflowRunSchema.index({ userId: 1, workflowId: 1, createdAt: -1 }, { name: 'user_workflow_recent' });
// Lets every poll find runs that were saved but never enqueued without a collection scan.
WorkflowRunSchema.index({ workflowId: 1, status: 1, createdAt: 1 }, { name: 'workflow_status_created' });
// Run history retention (default 30 days). Change and re-create the index to adjust.
WorkflowRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600, name: 'run_retention' });
