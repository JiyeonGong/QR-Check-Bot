import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";
import type { QrEventInput } from "./types.js";

type DatabaseConnection = Database.Database;
type Statement = Database.Statement;

let db: DatabaseConnection | null = null;
let hasQrEventStatement: Statement | null = null;
let insertQrEventStatement: Statement | null = null;
let markNormalUploadStatement: Statement | null = null;
let markMisplacedUploadStatement: Statement | null = null;
let markMissingAlertStatement: Statement | null = null;
let getDailyStatusStatement: Statement | null = null;

function getDatabase(): DatabaseConnection {
  if (db) {
    return db;
  }

  mkdirSync(dirname(config.databasePath), { recursive: true });

  db = new Database(config.databasePath, {
    timeout: 1_000,
  });

  db.exec(`
    CREATE TABLE IF NOT EXISTS qr_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_message_id TEXT UNIQUE,
      discord_channel_id TEXT,
      discord_thread_id TEXT,
      discord_author_id TEXT,
      cohort_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message_title TEXT,
      discord_message_url TEXT,
      image_count INTEGER NOT NULL,
      slack_channel_id TEXT,
      slack_parent_ts TEXT,
      slack_reply_ts TEXT,
      discord_created_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_cohort_status (
      status_date TEXT NOT NULL,
      cohort_id TEXT NOT NULL,
      normal_upload_detected INTEGER NOT NULL DEFAULT 0,
      normal_upload_message_id TEXT,
      misplaced_upload_detected INTEGER NOT NULL DEFAULT 0,
      missing_alert_sent INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (status_date, cohort_id)
    );
  `);

  hasQrEventStatement = db.prepare(`
    SELECT 1 FROM qr_events WHERE discord_message_id = ? LIMIT 1
  `);

  insertQrEventStatement = db.prepare(`
    INSERT INTO qr_events (
      discord_message_id,
      discord_channel_id,
      discord_thread_id,
      discord_author_id,
      cohort_id,
      event_type,
      message_title,
      discord_message_url,
      image_count,
      slack_channel_id,
      slack_parent_ts,
      slack_reply_ts,
      discord_created_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  markNormalUploadStatement = db.prepare(`
    INSERT INTO daily_cohort_status (
      status_date,
      cohort_id,
      normal_upload_detected,
      normal_upload_message_id,
      misplaced_upload_detected,
      missing_alert_sent,
      updated_at
    ) VALUES (?, ?, 1, ?, 0, 0, ?)
    ON CONFLICT(status_date, cohort_id) DO UPDATE SET
      normal_upload_detected = 1,
      normal_upload_message_id = excluded.normal_upload_message_id,
      updated_at = excluded.updated_at
  `);

  markMisplacedUploadStatement = db.prepare(`
    INSERT INTO daily_cohort_status (
      status_date,
      cohort_id,
      normal_upload_detected,
      misplaced_upload_detected,
      missing_alert_sent,
      updated_at
    ) VALUES (?, ?, 0, 1, 0, ?)
    ON CONFLICT(status_date, cohort_id) DO UPDATE SET
      misplaced_upload_detected = 1,
      updated_at = excluded.updated_at
  `);

  markMissingAlertStatement = db.prepare(`
    INSERT INTO daily_cohort_status (
      status_date,
      cohort_id,
      normal_upload_detected,
      misplaced_upload_detected,
      missing_alert_sent,
      updated_at
    ) VALUES (?, ?, 0, 0, 1, ?)
    ON CONFLICT(status_date, cohort_id) DO UPDATE SET
      missing_alert_sent = 1,
      updated_at = excluded.updated_at
  `);

  getDailyStatusStatement = db.prepare(`
    SELECT
      normal_upload_detected AS normalUploadDetected,
      missing_alert_sent AS missingAlertSent
    FROM daily_cohort_status
    WHERE status_date = ? AND cohort_id = ?
    LIMIT 1
  `);

  return db;
}

export function hasQrEvent(discordMessageId: string): boolean {
  getDatabase();
  return Boolean(hasQrEventStatement?.get(discordMessageId));
}

export function saveQrEvent(input: QrEventInput): void {
  getDatabase();
  insertQrEventStatement?.run(
    input.discordMessageId,
    input.discordChannelId,
    input.discordThreadId,
    input.discordAuthorId,
    input.cohortId,
    input.eventType,
    input.messageTitle,
    input.discordMessageUrl,
    input.imageCount,
    input.slackChannelId,
    input.slackParentTs,
    input.slackReplyTs,
    input.discordCreatedAt?.toISOString() ?? null,
    new Date().toISOString(),
  );
}

export function markNormalUpload(
  statusDate: string,
  cohortId: string,
  discordMessageId: string,
): void {
  getDatabase();
  markNormalUploadStatement?.run(statusDate, cohortId, discordMessageId, new Date().toISOString());
}

export function markMisplacedUpload(statusDate: string, cohortId: string): void {
  getDatabase();
  markMisplacedUploadStatement?.run(statusDate, cohortId, new Date().toISOString());
}

export function markMissingAlertSent(statusDate: string, cohortId: string): void {
  getDatabase();
  markMissingAlertStatement?.run(statusDate, cohortId, new Date().toISOString());
}

type DailyStatusRow = {
  normalUploadDetected: number;
  missingAlertSent: number;
};

export function getDailyCohortStatus(statusDate: string, cohortId: string): {
  normalUploadDetected: boolean;
  missingAlertSent: boolean;
} {
  getDatabase();
  const row = getDailyStatusStatement?.get(statusDate, cohortId) as DailyStatusRow | undefined;

  return {
    normalUploadDetected: Boolean(row?.normalUploadDetected),
    missingAlertSent: Boolean(row?.missingAlertSent),
  };
}

export function closeDatabase(): void {
  db?.close();
  db = null;
  hasQrEventStatement = null;
  insertQrEventStatement = null;
  markNormalUploadStatement = null;
  markMisplacedUploadStatement = null;
  markMissingAlertStatement = null;
  getDailyStatusStatement = null;
}
