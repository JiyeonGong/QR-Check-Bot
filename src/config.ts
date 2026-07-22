import "dotenv/config";

const requiredEnvKeys = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_ID",
  "DISCORD_QR_PARENT_CHANNEL_ID",
  "DISCORD_QR_THREAD_NAME",
  "SLACK_BOT_TOKEN",
  "SLACK_DAILY_CHANNEL_ID",
  "COHORT_NAME",
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

export const config = {
  discordBotToken: getRequiredEnv("DISCORD_BOT_TOKEN"),
  discordGuildId: getRequiredEnv("DISCORD_GUILD_ID"),
  discordQrParentChannelId: getRequiredEnv("DISCORD_QR_PARENT_CHANNEL_ID"),
  discordQrThreadName: getRequiredEnv("DISCORD_QR_THREAD_NAME"),
  slackBotToken: getRequiredEnv("SLACK_BOT_TOKEN"),
  slackDailyChannelId: getRequiredEnv("SLACK_DAILY_CHANNEL_ID"),
  cohortName: getRequiredEnv("COHORT_NAME"),
  timezone: getRequiredEnv("TIMEZONE"),
  databasePath: getRequiredEnv("DATABASE_PATH"),
};
