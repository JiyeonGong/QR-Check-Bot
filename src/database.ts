import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { config } from "./config.js";

type DatabaseConnection = Database.Database;
type Statement = Database.Statement;

let db: DatabaseConnection | null = null;
let hasProcessedStatement: Statement | null = null;
let insertProcessedStatement: Statement | null = null;

function getDatabase(): DatabaseConnection {
  if (db) {
    return db;
  }

  mkdirSync(dirname(config.databasePath), { recursive: true });

  db = new Database(config.databasePath, {
    timeout: 1_000,
  });

  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_messages (
      discord_message_id TEXT PRIMARY KEY,
      discord_thread_id TEXT NOT NULL,
      slack_channel_id TEXT NOT NULL,
      slack_parent_ts TEXT NOT NULL,
      slack_reply_ts TEXT NOT NULL,
      processed_at TEXT NOT NULL
    )
  `);

  hasProcessedStatement = db.prepare(`
    SELECT 1 FROM processed_messages WHERE discord_message_id = ? LIMIT 1
  `);

  insertProcessedStatement = db.prepare(`
    INSERT INTO processed_messages (
      discord_message_id,
      discord_thread_id,
      slack_channel_id,
      slack_parent_ts,
      slack_reply_ts,
      processed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  return db;
}

export function hasProcessedMessage(discordMessageId: string): boolean {
  getDatabase();
  return Boolean(hasProcessedStatement?.get(discordMessageId));
}

type SaveProcessedMessageInput = {
  discordMessageId: string;
  discordThreadId: string;
  slackChannelId: string;
  slackParentTs: string;
  slackReplyTs: string;
};

export function saveProcessedMessage(input: SaveProcessedMessageInput): void {
  getDatabase();
  insertProcessedStatement?.run(
    input.discordMessageId,
    input.discordThreadId,
    input.slackChannelId,
    input.slackParentTs,
    input.slackReplyTs,
    new Date().toISOString(),
  );
}

export function closeDatabase(): void {
  db?.close();
  db = null;
  hasProcessedStatement = null;
  insertProcessedStatement = null;
}
