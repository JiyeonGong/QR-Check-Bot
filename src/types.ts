export type CohortConfig = {
  id: string;
  cohortName: string;
  discordParentChannelId: string;
  discordParentChannelName: string;
  discordThreadName: string;
  managerIds: string[];
  slackParentMessageKeyword: string;
  active: boolean;
};

export type QrEventType = "normal" | "misplaced" | "missing";

export type QrEventInput = {
  discordMessageId: string | null;
  discordChannelId: string | null;
  discordThreadId: string | null;
  discordAuthorId: string | null;
  cohortId: string;
  eventType: QrEventType;
  messageTitle: string | null;
  discordMessageUrl: string | null;
  imageCount: number;
  slackChannelId: string | null;
  slackParentTs: string | null;
  slackReplyTs: string | null;
  discordCreatedAt: Date | null;
};
