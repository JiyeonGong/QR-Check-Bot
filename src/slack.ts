import { WebClient } from "@slack/web-api";
import { config } from "./config.js";
import { isTodayInTimeZone } from "./date.js";
import type { CohortConfig } from "./types.js";

const slack = new WebClient(config.slackBotToken);

type SlackParentMessage = {
  ts: string;
  text: string;
};

export async function findTodayQrParentMessage(
  cohort: CohortConfig,
): Promise<SlackParentMessage | null> {
  const response = await slack.conversations.history({
    channel: config.slackDailyChannelId,
    limit: 100,
  });

  const messages = response.messages ?? [];

  const candidates = messages.filter((message): message is SlackParentMessage => {
    if (!message.ts || typeof message.text !== "string") {
      return false;
    }

    if (message.thread_ts && message.thread_ts !== message.ts) {
      return false;
    }

    const messageDate = new Date(Number(message.ts.split(".")[0]) * 1_000);

    return (
      isTodayInTimeZone(messageDate, config.timezone) &&
      message.text.includes(cohort.slackParentMessageKeyword) &&
      /QR\s*코드/i.test(message.text)
    );
  });

  return candidates[0] ?? null;
}

export async function postSlackThreadReply(
  threadTs: string,
  text: string,
): Promise<string> {
  const response = await slack.chat.postMessage({
    channel: config.slackDailyChannelId,
    thread_ts: threadTs,
    text,
    unfurl_links: false,
    unfurl_media: false,
  });

  if (!response.ts) {
    throw new Error("Slack reply was posted but response.ts was empty");
  }

  return response.ts;
}
