export const QUEUE_NAME = "microsubtracker";

export const JobName = {
  TrialReminders: "trial-reminders",
  RenewalReminders: "renewal-reminders",
  GhostDetection: "ghost-detection",
  CurrencyRateUpdate: "currency-rate-update",
  ProcessNotification: "process-notification",
  WeeklySummary: "weekly-summary",
  UpcomingWeekDigest: "upcoming-week-digest",
  MonthlyCalculations: "monthly-calculations",
  ExpiredSessionCleanup: "expired-session-cleanup",
} as const;

export type JobName = (typeof JobName)[keyof typeof JobName];

export type NotificationJobData = {
  userId: string;
  subscriptionId: string | null;
  type: "trial" | "renewal" | "ghost" | "weekly_summary" | "upcoming_week";
  title: string;
  body: string;
  dedupeKey: string;
};

export type EmptyJobData = Record<string, never>;

export type JobPayloadMap = {
  [JobName.TrialReminders]: EmptyJobData;
  [JobName.RenewalReminders]: EmptyJobData;
  [JobName.GhostDetection]: EmptyJobData;
  [JobName.CurrencyRateUpdate]: EmptyJobData;
  [JobName.ProcessNotification]: NotificationJobData;
  [JobName.WeeklySummary]: EmptyJobData;
  [JobName.UpcomingWeekDigest]: EmptyJobData;
  [JobName.MonthlyCalculations]: EmptyJobData;
  [JobName.ExpiredSessionCleanup]: EmptyJobData;
};
