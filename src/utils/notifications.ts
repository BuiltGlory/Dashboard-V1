import { readAdminSession } from '@/api/admin'
import { sendWorkflowPush, type WorkflowEntityType } from '@/api/adminWorkflow'

export type NotificationTemplate = {
  title: string
  body: string
  deepLink: string
}

export const NOTIFICATION_TEMPLATES = {
  N02_ENQUIRY_RESPONDED: (_buyerName: string, propertyTitle: string): NotificationTemplate => ({
    title: 'Enquiry Response Received',
    body: `Team Builtglory responded to your enquiry for ${propertyTitle}.`,
    deepLink: 'P-02 My Enquiries',
  }),

  N03_VISIT_CONFIRMED: (
    _buyerName: string,
    propertyTitle: string,
    date: string,
    time: string,
  ): NotificationTemplate => ({
    title: 'Visit Confirmed! 📅',
    body: `Your visit for ${propertyTitle} is confirmed for ${date} at ${time}.`,
    deepLink: 'B-13 Visit Confirmation',
  }),

  N04_VISIT_REMINDER: (
    _buyerName: string,
    propertyTitle: string,
    time: string,
  ): NotificationTemplate => ({
    title: 'Visit Reminder 🔔',
    body: `Reminder: Your visit for ${propertyTitle} is tomorrow at ${time}. See you there!`,
    deepLink: 'B-13 Visit Confirmation',
  }),

  N05_VISIT_CANCELLED: (
    _buyerName: string,
    propertyTitle: string,
    reason: string,
  ): NotificationTemplate => ({
    title: 'Visit Cancelled',
    body: `Your visit for ${propertyTitle} was cancelled. Reason: ${reason}`,
    deepLink: 'B-12 Schedule Visit',
  }),

  N06_LISTING_APPROVED: (_sellerName: string, propertyTitle: string): NotificationTemplate => ({
    title: 'Listing Approved! 🎉',
    body: `Your listing "${propertyTitle}" is now live on Builtglory!`,
    deepLink: 'SL-09 Seller Dashboard',
  }),

  N07_LISTING_REJECTED: (
    _sellerName: string,
    propertyTitle: string,
    reason: string,
  ): NotificationTemplate => ({
    title: 'Listing Needs Changes',
    body: `Your listing "${propertyTitle}" needs changes: ${reason}`,
    deepLink: 'SL-07 Review Listing',
  }),

  N09_INTERIOR_QUOTE: (_buyerName: string, propertyTitle: string): NotificationTemplate => ({
    title: 'Interior Quote Ready! 🛋️',
    body: `Your interior design quote for ${propertyTitle} is ready. Valid for 72 hours.`,
    deepLink: 'INT-05 Price Confirmation',
  }),

  N10_STAGE_PAYMENT_PLAN: (_buyerName: string, propertyTitle: string): NotificationTemplate => ({
    title: 'Payment Plan Ready! 💳',
    body: `Your stage payment plan for ${propertyTitle} is ready. Valid for 72 hours.`,
    deepLink: 'B-13C Plan Confirmed',
  }),

  N11_MILESTONE_VERIFIED: (_buyerName: string, stageName: string): NotificationTemplate => ({
    title: 'Milestone Verified! ✅',
    body: `${stageName} has been verified. Next payment stage is now active.`,
    deepLink: 'B-13D Tracking Dashboard',
  }),

  N12_MILESTONE_REJECTED: (
    _buyerName: string,
    stageName: string,
    reason: string,
  ): NotificationTemplate => ({
    title: 'Proof Needs Resubmission',
    body: `${stageName} proof rejected: ${reason}. Please reupload.`,
    deepLink: 'B-13E Milestone Inspection',
  }),

  N13_KYC_VERIFIED: (_userName: string): NotificationTemplate => ({
    title: 'KYC Verified! 🎉',
    body: 'Your KYC documents have been verified. You can now access all features.',
    deepLink: 'P-06 KYC Documents',
  }),

  N14_KYC_REJECTED: (_userName: string, reason: string): NotificationTemplate => ({
    title: 'KYC Document Issue',
    body: `KYC rejected: ${reason}. Please reupload your documents.`,
    deepLink: 'P-06 KYC Documents',
  }),

  N15_UPCOMING_LAUNCH: (propertyTitle: string): NotificationTemplate => ({
    title: 'Property Launching Soon! 🏠',
    body: `"${propertyTitle}" launches in 24 hours! Be ready to enquire.`,
    deepLink: 'B-04 Property Detail',
  }),

  N16_PRICE_DROP: (
    propertyTitle: string,
    oldPrice: string,
    newPrice: string,
  ): NotificationTemplate => ({
    title: 'Price Dropped! 📉',
    body: `"${propertyTitle}" price reduced from ${oldPrice} to ${newPrice}.`,
    deepLink: 'B-04 Property Detail',
  }),

  N17_INTERIOR_CONFIRMED: (_buyerName: string): NotificationTemplate => ({
    title: 'Interior Order Confirmed! 🛋️',
    body: 'Your interior design order is confirmed. Work begins soon!',
    deepLink: 'INT-06 Deal Confirmed',
  }),

  N18_DOCUMENT_REQUESTED: (
    _partyName: string,
    documentName: string,
    propertyTitle: string,
  ): NotificationTemplate => ({
    title: 'Document Required 📄',
    body: `Please upload "${documentName}" for ${propertyTitle} on the app.`,
    deepLink: 'My Documents — Upload',
  }),
}

const recentNotificationKeys = new Map<string, number>()

export function wasNotificationSentRecently(
  key: string,
  windowMs = 30 * 60 * 1000,
): boolean {
  const last = recentNotificationKeys.get(key)
  return last != null && Date.now() - last < windowMs
}

export function markNotificationSent(key: string) {
  recentNotificationKeys.set(key, Date.now())
}

export type SendPushOptions = {
  skipDuplicateCheck?: boolean
  dedupeKey?: string
  userId?: string | null
  relatedTo?: {
    type: WorkflowEntityType
    id: string
  }
}

/** Sends workflow-backed push notifications and returns a user-facing result message. */
export function sendPushNotification(
  userName: string,
  template: NotificationTemplate,
  notificationId: string,
  options?: SendPushOptions,
): string {
  const dedupeKey = options?.dedupeKey ?? `${notificationId}:${userName}:${template.title}`
  if (!options?.skipDuplicateCheck && wasNotificationSentRecently(dedupeKey)) {
    return `Similar notification sent recently (${notificationId})`
  }

  const session = readAdminSession()
  if (!session?.accessToken || !options?.relatedTo) {
    return `Push notification not sent: backend workflow target is unavailable (${notificationId})`
  }

  markNotificationSent(dedupeKey)
  void sendWorkflowPush(session.accessToken, options.relatedTo.type, options.relatedTo.id, {
    userId: options.userId,
    recipient: userName,
    notificationId,
    template,
    dedupeKey,
    skipDuplicateCheck: true,
  }).catch(() => undefined)
  return `Push notification sent to ${userName}: "${template.title}"`
}
