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

export type MisplacedUploadData = QrUploadData & {
  actualLocation: string;
  expectedLocation: string;
};

export type MissingUploadData = {
  cohortName: string;
  checkedAt: Date;
  expectedLocation: string;
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
    "✅ 디스코드 QR코드 정상 업로드 확인",
    "",
    `• 기수: ${data.cohortName}`,
    `• 채널: ${data.channelName}`,
    `• 게시글: <${data.discordMessageUrl}|${data.title}>`,
    `• 작성자: ${data.authorName}`,
    `• 업로드 시간: ${formatKoreanTime(data.uploadedAt)}`,
    `• 첨부 이미지: ${data.imageCount}개`,
  ].join("\n");
}

export function formatSlackMisplacedQrMessage(data: MisplacedUploadData): string {
  return [
    "🚨 QR코드 오업로드 의심",
    "",
    `• 기수: ${data.cohortName}`,
    `• 실제 업로드 위치: ${data.actualLocation}`,
    `• 정상 위치: ${data.expectedLocation}`,
    `• 게시글: <${data.discordMessageUrl}|${data.title}>`,
    `• 작성자: ${data.authorName}`,
    `• 업로드 시간: ${formatKoreanTime(data.uploadedAt)}`,
    `• 첨부 이미지: ${data.imageCount}개`,
    "",
    "즉시 Discord 원문을 확인해 주세요.",
  ].join("\n");
}

export function formatSlackMissingQrMessage(data: MissingUploadData): string {
  return [
    "⚠️ QR코드 미업로드 확인 필요",
    "",
    `• 기수: ${data.cohortName}`,
    `• 확인 시각: ${formatKoreanTime(data.checkedAt)}`,
    `• 정상 위치: ${data.expectedLocation}`,
    "",
    "오늘 정상 QR 업로드가 아직 확인되지 않았습니다.",
  ].join("\n");
}
