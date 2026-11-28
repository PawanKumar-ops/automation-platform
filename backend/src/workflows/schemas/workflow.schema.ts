import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'error';

@Schema({ _id: false, versionKey: false })
export class WorkflowStep {
  /** Stable id used in mappings: `{{steps.<id>.field}}`. */
  @Prop({ required: true, match: /^[a-zA-Z0-9_-]{1,40}$/ })
  id!: string;

  @Prop({ required: true, maxlength: 64 })
  app!: string;

  /** Trigger key (for the trigger step) or action key. */
  @Prop({ required: true, maxlength: 64 })
  operation!: string;

  @Prop({ type: Types.ObjectId, ref: 'ConnectedAccount' })
  connectionId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  input!: Record<string, unknown>;
}
export const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep);

@Schema({ _id: false, versionKey: false })
export class TriggerState {
  /** False until the first poll records existing items (they are not replayed, like Zapier). */
  @Prop({ default: false })
  initialized!: boolean;

  /** Events older than this activation boundary must never start a run. */
  @Prop()
  activationAt?: Date;

  /** Most recent item ids already handled (newest first, capped). */
  @Prop({ type: [String], default: [] })
  seenIds!: string[];

  @Prop()
  lastPolledAt?: Date;

  @Prop()
  lastSuccessAt?: Date;

  @Prop({ maxlength: 1000 })
  lastError?: string;

  @Prop({ default: 0 })
  consecutiveFailures!: number;

  /** Backoff after failures: scheduled polls before this time are skipped cheaply. */
  @Prop()
  nextPollAt?: Date;

  /** Lease preventing two workers from polling the same workflow at once. */
  @Prop()
  pollLockUntil?: Date;
}
export const TriggerStateSchema = SchemaFactory.createForClass(TriggerState);

export type WorkflowDocument = HydratedDocument<Workflow>;

@Schema({ timestamps: true, versionKey: false })
export class Workflow {
  createdAt!: Date;
  updatedAt!: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ required: true, enum: ['draft', 'active', 'paused', 'error'], default: 'draft', index: true })
  status!: WorkflowStatus;

  @Prop({ maxlength: 1000 })
  statusReason?: string;

  /** Missing while a draft's trigger is not set up yet. Required to activate or run. */
  @Prop({ type: WorkflowStepSchema })
  trigger?: WorkflowStep;

  /** Actions, executed in this order. */
  @Prop({ type: [WorkflowStepSchema], default: [] })
  steps!: WorkflowStep[];

  @Prop({ required: true, min: 60, max: 86_400, default: 120 })
  pollIntervalSeconds!: number;

  @Prop({ type: TriggerStateSchema, default: () => ({}) })
  triggerState!: TriggerState;

  @Prop()
  lastRunAt?: Date;

  /** Incremented on every definition change; runs record the version they used. */
  @Prop({ default: 1 })
  revision!: number;

  /** Editor layout (cards, links and per-step drafts) so drafts reopen exactly as left. */
  @Prop({ type: MongooseSchema.Types.Mixed })
  canvas?: Record<string, unknown>;
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);
WorkflowSchema.index({ userId: 1, updatedAt: -1 }, { name: 'user_recent' });
WorkflowSchema.index({ 'trigger.connectionId': 1 }, { name: 'trigger_connection' });
