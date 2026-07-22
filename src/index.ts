import {
  Client,
  Events,
  GatewayIntentBits,
  type Attachment,
  type Message,
  type ThreadChannel,
} from "discord.js";
import { config } from "./config.js";
import {
  closeDatabase,
  hasProcessedMessage,
  saveProcessedMessage,
} from "./database.js";
import {
  cleanDiscordMessageTitle,
  formatSlackQrUploadMessage,
} from "./formatter.js";
import {
  findTodayQrParentMessage,
  postSlackThreadReply,
} from "./slack.js";

const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const processingMessages = new Set<string>();
let isShuttingDown = false;

console.log("[INFO] Starting Discord Slack QR bot");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`[INFO] Discord bot logged in as ${readyClient.user.tag}`);
  console.log(
    `[INFO] Watching Discord thread messages. threadName=${JSON.stringify(config.discordQrThreadName)}`,
  );
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
    if (!message.channel.isThread()) {
      return;
    }

    const thread = message.channel;

    console.log("[DEBUG] Discord thread message received");
    console.log(`threadName=${JSON.stringify(thread.name)}`);
    console.log(`threadParentId=${JSON.stringify(thread.parentId)}`);
    console.log(`content=${JSON.stringify(message.content)}`);
    console.log(`attachmentCount=${message.attachments.size}`);

    const ignoreReason = getQrMessageIgnoreReason(message, thread);

    if (ignoreReason) {
      console.log(`[DEBUG] QR message ignored. reason=${ignoreReason}`);
      return;
    }

    const imageAttachments = getImageAttachments(message);
    const authorName = message.member?.displayName ?? message.author.username;
    const cleanTitle = cleanDiscordMessageTitle(message.content);
    const discordMessageUrl = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;

    console.log("[INFO] Discord QR message detected");
    console.log(`threadName=${JSON.stringify(thread.name)}`);
    console.log(`threadParentId=${JSON.stringify(thread.parentId)}`);
    console.log(`threadId=${JSON.stringify(thread.id)}`);
    console.log(`slackTitle=${JSON.stringify(cleanTitle)}`);
    console.log(`author=${JSON.stringify(authorName)}`);
    console.log(`uploadedAt=${message.createdAt.toISOString()}`);
    console.log(`imageCount=${imageAttachments.length}`);

    if (processingMessages.has(message.id)) {
      console.log(`[INFO] Discord QR message is already processing. messageId=${message.id}`);
      return;
    }

    if (hasProcessedMessage(message.id)) {
      console.log(`[INFO] Discord QR message already processed. messageId=${message.id}`);
      return;
    }

    processingMessages.add(message.id);

    try {
      const parentMessage = await findTodayQrParentMessage();

      if (!parentMessage) {
        console.error(
          `[ERROR] Slack parent message not found for today. cohort=${JSON.stringify(config.cohortName)}`,
        );
        return;
      }

      console.log(`[INFO] Slack parent message found. parentTs=${parentMessage.ts}`);

      const slackText = formatSlackQrUploadMessage({
        cohortName: config.cohortName,
        channelName: config.discordQrThreadName,
        title: cleanTitle,
        discordMessageUrl,
        authorName,
        uploadedAt: message.createdAt,
        imageCount: imageAttachments.length,
      });

      const replyTs = await postSlackThreadReply(parentMessage.ts, slackText);

      saveProcessedMessage({
        discordMessageId: message.id,
        discordThreadId: thread.id,
        slackChannelId: config.slackDailyChannelId,
        slackParentTs: parentMessage.ts,
        slackReplyTs: replyTs,
      });

      console.log(`[INFO] Slack thread reply posted successfully. replyTs=${replyTs}`);
    } finally {
      processingMessages.delete(message.id);
    }
  } catch (error) {
    console.error("[ERROR] Failed to handle Discord messageCreate event", error);
  }
});

function getQrMessageIgnoreReason(
  message: Message,
  thread: ThreadChannel,
): string | null {
  if (message.guildId !== config.discordGuildId) {
    return "guild_id_mismatch";
  }

  if (thread.parentId !== config.discordQrParentChannelId) {
    return "parent_channel_id_mismatch";
  }

  if (thread.name !== config.discordQrThreadName) {
    return "thread_name_mismatch";
  }

  if (!hasDateText(message.content)) {
    return "date_text_not_found";
  }

  if (!hasQrCodeText(message.content)) {
    return "qr_code_text_not_found";
  }

  if (getImageAttachments(message).length === 0) {
    return "image_attachment_not_found";
  }

  return null;
}

function hasDateText(content: string): boolean {
  return (
    /\d{1,2}\s*월\s*\d{1,2}\s*일/.test(content) ||
    /\d{1,2}\s*[/.]\s*\d{1,2}/.test(content) ||
    /\d{4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}/.test(content)
  );
}

function hasQrCodeText(content: string): boolean {
  return /QR\s*코드/i.test(content);
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
