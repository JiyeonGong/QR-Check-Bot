import {
  Client,
  Events,
  GatewayIntentBits,
  type Attachment,
  type Message,
  type ThreadChannel,
} from "discord.js";
import cron from "node-cron";
import { loadCohortRegistry } from "./cohorts.js";
import { config } from "./config.js";
import {
  closeDatabase,
  getDailyCohortStatus,
  hasQrEvent,
  markMisplacedUpload,
  markMissingAlertSent,
  markNormalUpload,
  saveQrEvent,
} from "./database.js";
import {
  getDateKey,
  getHourInTimeZone,
  isAtOrAfterTimeInTimeZone,
  isWeekdayInTimeZone,
  toCronTime,
} from "./date.js";
import {
  cleanDiscordMessageTitle,
  formatSlackMisplacedQrMessage,
  formatSlackMissingQrMessage,
  formatSlackQrUploadMessage,
} from "./formatter.js";
import {
  findTodayQrParentMessage,
  postSlackThreadReply,
} from "./slack.js";
import type { CohortConfig } from "./types.js";

const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const qrTextPattern = /QR\s*코드|QR/i;
const processingMessages = new Set<string>();
let isShuttingDown = false;

console.log("[INFO] Starting CM Safety Bot v2");

const cohortRegistry = loadCohortRegistry();
const missingCheckCronTime = toCronTime(config.qrMissingCheckTime);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`[INFO] Discord bot logged in as ${readyClient.user.tag}`);
  console.log(`[INFO] Loaded active cohorts. count=${cohortRegistry.cohorts.length}`);
  scheduleMissingUploadCheck();
  void runStartupMissingUploadCheck(new Date());
});

client.on(Events.Warn, (warning) => {
  console.warn(`[WARN] Discord client warning: ${warning}`);
});

client.on(Events.Error, (error) => {
  console.error("[ERROR] Discord client error", error);
});

client.on(Events.ShardError, (error) => {
  console.error("[ERROR] Discord shard error", error);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleDiscordMessage(message);
  } catch (error) {
    console.error("[ERROR] Failed to handle Discord messageCreate event", error);
  }
});

async function handleDiscordMessage(message: Message): Promise<void> {
  if (message.author.bot) {
    return;
  }

  if (message.guildId !== config.discordGuildId) {
    return;
  }

  const imageAttachments = getImageAttachments(message);
  const hasQrText = qrTextPattern.test(message.content);

  if (message.attachments.size > 0 || hasQrText) {
    console.log("[DEBUG] Discord QR candidate check");
    console.log(`authorId=${message.author.id}`);
    console.log(`author=${JSON.stringify(getDisplayAuthorName(message))}`);
    console.log(`location=${JSON.stringify(getDiscordLocationLabel(message))}`);
    console.log(`content=${JSON.stringify(message.content)}`);
    console.log(`attachmentCount=${message.attachments.size}`);
    console.log(`imageCount=${imageAttachments.length}`);
  }

  if (imageAttachments.length === 0) {
    if (message.attachments.size > 0 || hasQrText) {
      console.log("[DEBUG] QR candidate ignored. reason=image_attachment_not_found");
    }
    return;
  }

  if (!hasQrText) {
    console.log("[DEBUG] QR candidate ignored. reason=qr_text_not_found");
    return;
  }

  if (!cohortRegistry.registeredManagerIds.has(message.author.id)) {
    console.log(
      `[DEBUG] QR candidate ignored because author is not registered. authorId=${message.author.id} author=${JSON.stringify(getDisplayAuthorName(message))}`,
    );
    return;
  }

  if (processingMessages.has(message.id)) {
    console.log(`[INFO] Discord QR message is already processing. messageId=${message.id}`);
    return;
  }

  if (hasQrEvent(message.id)) {
    console.log(`[INFO] Discord QR message already processed. messageId=${message.id}`);
    return;
  }

  processingMessages.add(message.id);

  try {
    const managerCohorts = cohortRegistry.cohortsByManagerId.get(message.author.id) ?? [];
    const normalCohort = managerCohorts.find((cohort) => isCorrectLocation(message, cohort));

    if (normalCohort) {
      await handleNormalUpload(message, normalCohort, imageAttachments.length);
      return;
    }

    if (!isWithinMisplacedMonitorWindow(new Date())) {
      console.log(`[INFO] QR candidate ignored outside misplaced monitor window. messageId=${message.id}`);
      return;
    }

    const misplacedCohort = resolveMisplacedCohort(message, managerCohorts);

    if (misplacedCohort) {
      await handleMisplacedUpload(message, misplacedCohort, imageAttachments.length);
      return;
    }

    console.log(`[DEBUG] QR candidate ignored. reason=no_matching_cohort messageId=${message.id}`);
  } finally {
    processingMessages.delete(message.id);
  }
}

async function handleNormalUpload(
  message: Message,
  cohort: CohortConfig,
  imageCount: number,
): Promise<void> {
  const cleanTitle = cleanDiscordMessageTitle(message.content);
  const discordMessageUrl = getDiscordMessageUrl(message);
  const authorName = getDisplayAuthorName(message);
  const parentMessage = await findTodayQrParentMessage(cohort);

  if (!parentMessage) {
    console.error(
      `[ERROR] Slack parent message not found for today. cohort=${JSON.stringify(cohort.cohortName)}`,
    );
    return;
  }

  const slackText = formatSlackQrUploadMessage({
    cohortName: cohort.cohortName,
    channelName: cohort.discordThreadName,
    title: cleanTitle,
    discordMessageUrl,
    authorName,
    uploadedAt: message.createdAt,
    imageCount,
  });

  const replyTs = await postSlackThreadReply(parentMessage.ts, slackText);

  saveQrEvent({
    discordMessageId: message.id,
    discordChannelId: message.channelId,
    discordThreadId: message.channel.isThread() ? message.channel.id : null,
    discordAuthorId: message.author.id,
    cohortId: cohort.id,
    eventType: "normal",
    messageTitle: cleanTitle,
    discordMessageUrl,
    imageCount,
    slackChannelId: config.slackDailyChannelId,
    slackParentTs: parentMessage.ts,
    slackReplyTs: replyTs,
    discordCreatedAt: message.createdAt,
  });

  markNormalUpload(getDateKey(message.createdAt, config.timezone), cohort.id, message.id);

  console.log(
    `[INFO] Normal QR upload reported. cohort=${JSON.stringify(cohort.cohortName)} replyTs=${replyTs}`,
  );
}

async function handleMisplacedUpload(
  message: Message,
  cohort: CohortConfig,
  imageCount: number,
): Promise<void> {
  const cleanTitle = cleanDiscordMessageTitle(message.content);
  const discordMessageUrl = getDiscordMessageUrl(message);
  const authorName = getDisplayAuthorName(message);
  const parentMessage = await findTodayQrParentMessage(cohort);

  if (!parentMessage) {
    console.error(
      `[ERROR] Slack parent message not found for misplaced QR. cohort=${JSON.stringify(cohort.cohortName)}`,
    );
    return;
  }

  const slackText = formatSlackMisplacedQrMessage({
    cohortName: cohort.cohortName,
    channelName: cohort.discordThreadName,
    title: cleanTitle,
    discordMessageUrl,
    authorName,
    uploadedAt: message.createdAt,
    imageCount,
    actualLocation: getDiscordLocationLabel(message),
    expectedLocation: getExpectedLocationLabel(cohort),
  });

  const replyTs = await postSlackThreadReply(parentMessage.ts, slackText);

  saveQrEvent({
    discordMessageId: message.id,
    discordChannelId: message.channelId,
    discordThreadId: message.channel.isThread() ? message.channel.id : null,
    discordAuthorId: message.author.id,
    cohortId: cohort.id,
    eventType: "misplaced",
    messageTitle: cleanTitle,
    discordMessageUrl,
    imageCount,
    slackChannelId: config.slackDailyChannelId,
    slackParentTs: parentMessage.ts,
    slackReplyTs: replyTs,
    discordCreatedAt: message.createdAt,
  });

  markMisplacedUpload(getDateKey(message.createdAt, config.timezone), cohort.id);

  console.log(
    `[WARN] Misplaced QR upload reported. cohort=${JSON.stringify(cohort.cohortName)} replyTs=${replyTs}`,
  );
}

function resolveMisplacedCohort(
  message: Message,
  managerCohorts: CohortConfig[],
): CohortConfig | null {
  if (managerCohorts.length === 0) {
    return null;
  }

  if (message.channel.isThread() && message.channel.parentId) {
    const actualCohort = cohortRegistry.cohortByParentChannelId.get(message.channel.parentId);

    if (actualCohort && managerCohorts.some((cohort) => cohort.id === actualCohort.id)) {
      return actualCohort;
    }
  }

  return managerCohorts[0] ?? null;
}

function isCorrectLocation(message: Message, cohort: CohortConfig): boolean {
  return (
    message.channel.isThread() &&
    message.channel.parentId === cohort.discordParentChannelId &&
    message.channel.name === cohort.discordThreadName
  );
}

function isWithinMisplacedMonitorWindow(date: Date): boolean {
  const hour = getHourInTimeZone(date, config.timezone);
  return hour >= config.qrMonitorStartHour && hour < config.qrMonitorEndHour;
}

function getImageAttachments(message: Message): Attachment[] {
  return [...message.attachments.values()].filter(isImageAttachment);
}

function isImageAttachment(attachment: Attachment): boolean {
  if (attachment.contentType?.startsWith("image/")) {
    return true;
  }

  const filename = attachment.name?.toLowerCase() ?? "";
  return imageExtensions.some((extension) => filename.endsWith(extension));
}

function getDisplayAuthorName(message: Message): string {
  return message.member?.displayName ?? message.author.globalName ?? message.author.username;
}

function getDiscordMessageUrl(message: Message): string {
  return `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
}

function getDiscordLocationLabel(message: Message): string {
  if (message.channel.isThread()) {
    return `${message.channel.parent?.name ?? "알 수 없는 채널"} → ${message.channel.name}`;
  }

  if ("name" in message.channel && message.channel.name) {
    return message.channel.name;
  }

  return message.channelId ?? "알 수 없는 채널";
}

function getExpectedLocationLabel(cohort: CohortConfig): string {
  return `${cohort.discordParentChannelName} → ${cohort.discordThreadName}`;
}

function scheduleMissingUploadCheck(): void {
  cron.schedule(
    `${missingCheckCronTime.minute} ${missingCheckCronTime.hour} * * 1-5`,
    () => {
      void runMissingUploadCheck(new Date());
    },
    {
      timezone: config.timezone,
    },
  );

  console.log(`[INFO] Scheduled missing QR check. time=${config.qrMissingCheckTime}`);
}

async function runStartupMissingUploadCheck(now: Date): Promise<void> {
  if (!isWeekdayInTimeZone(now, config.timezone)) {
    return;
  }

  if (!isAtOrAfterTimeInTimeZone(now, config.timezone, missingCheckCronTime)) {
    return;
  }

  console.log("[INFO] Running startup missing QR check because scheduled time has already passed");
  await runMissingUploadCheck(now);
}

async function runMissingUploadCheck(now: Date): Promise<void> {
  if (!isWeekdayInTimeZone(now, config.timezone)) {
    return;
  }

  const statusDate = getDateKey(now, config.timezone);

  for (const cohort of cohortRegistry.cohorts) {
    const status = getDailyCohortStatus(statusDate, cohort.id);

    if (status.normalUploadDetected || status.missingAlertSent) {
      continue;
    }

    const parentMessage = await findTodayQrParentMessage(cohort);

    if (!parentMessage) {
      console.error(
        `[ERROR] Slack parent message not found for missing QR alert. cohort=${JSON.stringify(cohort.cohortName)}`,
      );
      continue;
    }

    const slackText = formatSlackMissingQrMessage({
      cohortName: cohort.cohortName,
      checkedAt: now,
      expectedLocation: getExpectedLocationLabel(cohort),
    });

    const replyTs = await postSlackThreadReply(parentMessage.ts, slackText);

    saveQrEvent({
      discordMessageId: null,
      discordChannelId: null,
      discordThreadId: null,
      discordAuthorId: null,
      cohortId: cohort.id,
      eventType: "missing",
      messageTitle: null,
      discordMessageUrl: null,
      imageCount: 0,
      slackChannelId: config.slackDailyChannelId,
      slackParentTs: parentMessage.ts,
      slackReplyTs: replyTs,
      discordCreatedAt: null,
    });

    markMissingAlertSent(statusDate, cohort.id);
    console.log(
      `[WARN] Missing QR upload alert posted. cohort=${JSON.stringify(cohort.cohortName)} replyTs=${replyTs}`,
    );
  }
}

console.log("[INFO] Logging in to Discord");

client
  .login(config.discordBotToken)
  .then(() => {
    console.log("[INFO] Discord login request completed");
  })
  .catch((error) => {
    console.error("[ERROR] Discord bot login failed", error);
    process.exit(1);
  });

process.once("SIGINT", () => {
  shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`[INFO] Shutting down. signal=${signal}`);

  try {
    client.destroy();
    closeDatabase();
  } catch (error) {
    console.error("[ERROR] Failed during shutdown", error);
    process.exit(1);
  }

  process.exit(0);
}
