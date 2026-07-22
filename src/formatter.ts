import { config } from "./config.js";

export type QrUploadData = {
  cohortName: string;
  channelName: string;
  title: string;
  discordMessageUrl: string;
  authorName: string;
  uploadedAt: Date;
  imageCount: number;
};

export function cleanDiscordMessageTitle(content: string): string {
  return content.replace(/^#+\s*/, "").trim();
}

export function formatKoreanTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: config.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatSlackQrUploadMessage(data: QrUploadData): string {
  return [
    "✅ 디스코드 QR코드 업로드 완료",
    "",
    `• 기수: ${data.cohortName}`,
    `• 채널: ${data.channelName}`,
    `• 게시글: <${data.discordMessageUrl}|${data.title}>`,
    `• 작성자: ${data.authorName}`,
    `• 업로드 시간: ${formatKoreanTime(data.uploadedAt)}`,
    `• 첨부 이미지: ${data.imageCount}개`,
  ].join("\n");
}
