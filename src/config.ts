import "dotenv/config";

const requiredEnvKeys = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_ID",
  "SLACK_BOT_TOKEN",
  "SLACK_DAILY_CHANNEL_ID",
  "TIMEZONE",
  "DATABASE_PATH",
] as const;

function getRequiredEnv(key: (typeof requiredEnvKeys)[number]): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  discordBotToken: getRequiredEnv("DISCORD_BOT_TOKEN"),
  discordGuildId: getRequiredEnv("DISCORD_GUILD_ID"),
  slackBotToken: getRequiredEnv("SLACK_BOT_TOKEN"),
  slackDailyChannelId: getRequiredEnv("SLACK_DAILY_CHANNEL_ID"),
  timezone: getRequiredEnv("TIMEZONE"),
  databasePath: getRequiredEnv("DATABASE_PATH"),
  cohortsConfigPath: getOptionalEnv("COHORTS_CONFIG_PATH", "./config/cohorts.json"),
  qrMonitorStartHour: Number(getOptionalEnv("QR_MONITOR_START_HOUR", "7")),
  qrMonitorEndHour: Number(getOptionalEnv("QR_MONITOR_END_HOUR", "10")),
  qrMissingCheckTime: getOptionalEnv("QR_MISSING_CHECK_TIME", "08:50"),
};
