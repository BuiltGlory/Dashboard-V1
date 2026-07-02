import { readAdminSession } from '@/api/admin'
import {
  createWorkflowLog,
  deleteWorkflowLog,
  listWorkflowLogs,
  type WorkflowLog,
} from '@/api/adminWorkflow'

export interface StageCallLogEntry {
  id: string
  calledAt: string
  duration: number
  outcome: string
  notes: string
}

export interface StagePanelCallLogEntry {
  id: string
  at: string
  duration: number
  outcome: string
  notes: string
  recordingUrl?: string
  recordingFileName?: string
  recordingSize?: number
}

export interface StageNoteEntry {
  id: string
  text: string
  at: string
}

export function workflowLogToStageCall(log: WorkflowLog, fallbackOutcome: string): StageCallLogEntry {
  return {
    id: log.id,
    calledAt: log.occurredAt,
    duration: log.durationMinutes ?? 1,
    outcome: log.outcome || fallbackOutcome,
    notes: log.body || '',
  }
}

export function workflowLogToPanelCall(log: WorkflowLog, fallbackOutcome: string): StagePanelCallLogEntry {
  const attachment = log.attachments[0]
  return {
    id: log.id,
    at: log.occurredAt,
    duration: log.durationMinutes ?? 1,
    outcome: log.outcome || fallbackOutcome,
    notes: log.body || '',
    ...(attachment?.url
      ? {
          recordingUrl: attachment.url,
          recordingFileName: attachment.fileName,
          recordingSize: attachment.sizeBytes,
        }
      : {}),
  }
}

export function workflowLogToStageNote(log: WorkflowLog): StageNoteEntry {
  return {
    id: log.id,
    text: log.body || '',
    at: log.occurredAt || log.createdAt,
  }
}

export async function loadStageWorkflowLogs(
  entityType: 'sales-deal' | 'acquisition',
  entityId: string,
  callSummaryPrefix: string,
  noteSummary: string,
) {
  const session = readAdminSession()
  if (!session?.accessToken || !entityId) return { calls: [] as WorkflowLog[], notes: [] as WorkflowLog[] }
  const [callResult, noteResult] = await Promise.all([
    listWorkflowLogs(session.accessToken, entityType, entityId, 'call').catch(() => ({ data: [] as WorkflowLog[] })),
    listWorkflowLogs(session.accessToken, entityType, entityId, 'note').catch(() => ({ data: [] as WorkflowLog[] })),
  ])
  return {
    calls: callResult.data.filter((log) => log.summary.startsWith(callSummaryPrefix)),
    notes: noteResult.data.filter((log) => log.summary === noteSummary),
  }
}

export async function createStageCallLog(
  entityType: 'sales-deal' | 'acquisition',
  entityId: string,
  summaryPrefix: string,
  occurredAt: string,
  durationMinutes: number,
  outcome: string,
  notes: string,
  attachments?: WorkflowLog['attachments'],
) {
  const session = readAdminSession()
  if (!session?.accessToken) throw new Error('Admin session expired. Please sign in again.')
  return createWorkflowLog(session.accessToken, entityType, entityId, {
    channel: 'call',
    direction: 'outbound',
    summary: `${summaryPrefix}: ${outcome}`,
    body: notes,
    outcome,
    durationMinutes,
    occurredAt,
    attachments,
  })
}

export async function createStageNoteLog(
  entityType: 'sales-deal' | 'acquisition',
  entityId: string,
  summary: string,
  text: string,
) {
  const session = readAdminSession()
  if (!session?.accessToken) throw new Error('Admin session expired. Please sign in again.')
  return createWorkflowLog(session.accessToken, entityType, entityId, {
    channel: 'note',
    direction: 'internal',
    summary,
    body: text,
  })
}

export async function deleteStageWorkflowLog(logId: string) {
  const session = readAdminSession()
  if (!session?.accessToken) throw new Error('Admin session expired. Please sign in again.')
  await deleteWorkflowLog(session.accessToken, logId)
}
