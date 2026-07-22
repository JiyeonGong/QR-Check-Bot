# Discord QR 업로드 → Slack 스레드 자동 댓글 MVP 개발 명세

## 1. 목표

Discord의 지정된 `📸QR코드` 포럼 채널에 새로운 QR코드 게시글이 올라오면 이를 자동 감지하고, Slack의 해당 기수 일일업무 메시지 스레드에 업로드 완료 댓글을 작성한다.

이번 MVP에서는 **QR 업로드 자동 댓글 기능만 구현**한다.

---

## 2. 최종 동작 예시

### Discord

지정된 포럼 채널:

```text
📸QR코드
```

새 게시글:

```text
7월 21일(화) QR코드
```

게시글 조건:

- QR코드 이미지가 1개 이상 첨부되어 있음
- 게시글 작성자를 확인할 수 있음
- 게시글이 지정된 QR코드 포럼 채널에 생성됨

### Slack

지정된 `#일일업무` 채널에서 오늘 생성된 다음 형식의 부모 메시지를 찾는다.

```text
[AI_11기] QR 코드 / 로그대조 / 특이사항을 남겨주세요
```

그 부모 메시지의 스레드에 다음 댓글을 작성한다.

```text
✅ 디스코드 QR코드 업로드 완료

• 기수: AI_11기
• 채널: 📸QR코드
• 게시글: 7월 21일(화) QR코드
• 작성자: 홍길동
• 업로드 시간: 오전 8:30
• 첨부 이미지: 1개
```

---

## 3. MVP 범위

### 반드시 구현

- Discord 봇 로그인
- Slack 앱 로그인
- 지정 Discord 포럼 채널의 새 게시글 감지
- 게시글 제목 확인
- 게시글 작성자 확인
- 첨부 이미지 개수 확인
- QR 이미지가 첨부된 게시글만 처리
- 기수별 설정 매핑
- Slack 지정 채널의 최근 메시지 조회
- 오늘 생성된 해당 기수 일일업무 부모 메시지 검색
- 해당 메시지의 스레드에 댓글 작성
- 같은 Discord 게시글을 중복 전송하지 않도록 처리
- 실패 원인을 콘솔 로그로 출력
- 환경변수 누락 시 명확한 오류 출력

### 이번 MVP에서 제외

- Discord 게시글 수정 감지
- Discord 게시글 삭제 감지
- Slack 댓글 수정 또는 삭제
- 로그대조 자동화
- 특이사항 자동화
- 미업로드 알림
- 관리자 화면
- 여러 회사 워크스페이스 지원
- AI 요약
- 양방향 동기화

---

## 4. 권장 기술 스택

```text
Node.js 20+
TypeScript
discord.js v14
@slack/web-api
better-sqlite3
dotenv
tsx
```

패키지 설치 예시:

```bash
npm install discord.js @slack/web-api better-sqlite3 dotenv
npm install -D typescript tsx @types/node @types/better-sqlite3
```

---

## 5. 권장 프로젝트 구조

```text
discord-slack-qr-bot/
├─ src/
│  ├─ index.ts
│  ├─ config.ts
│  ├─ discord.ts
│  ├─ slack.ts
│  ├─ database.ts
│  ├─ formatter.ts
│  ├─ types.ts
│  └─ utils/
│     ├─ date.ts
│     └─ logger.ts
├─ data/
│  └─ bot.db
├─ .env.example
├─ .gitignore
├─ package.json
├─ tsconfig.json
└─ README.md
```

---

## 6. 환경변수

`.env.example`

```env
# Discord
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_QR_FORUM_CHANNEL_ID=

# Slack
SLACK_BOT_TOKEN=
SLACK_DAILY_CHANNEL_ID=

# Cohort
COHORT_NAME=AI_11기

# Runtime
TIMEZONE=Asia/Seoul
DATABASE_PATH=./data/bot.db
LOG_LEVEL=info
```

환경변수 설명:

| 변수 | 설명 |
|---|---|
| `DISCORD_BOT_TOKEN` | Discord Developer Portal에서 발급한 봇 토큰 |
| `DISCORD_GUILD_ID` | 테스트 Discord 서버 ID |
| `DISCORD_QR_FORUM_CHANNEL_ID` | `📸QR코드` 포럼 채널 ID |
| `SLACK_BOT_TOKEN` | `xoxb-`로 시작하는 Slack Bot Token |
| `SLACK_DAILY_CHANNEL_ID` | `#일일업무` Slack 채널 ID |
| `COHORT_NAME` | 테스트할 기수명. 예: `AI_11기` |
| `TIMEZONE` | 날짜와 시간을 계산할 기준 시간대 |
| `DATABASE_PATH` | 중복 방지용 SQLite 파일 경로 |

토큰은 절대로 Git에 커밋하지 않는다.

---

## 7. Discord 앱 설정

### 필요한 Bot 권한

- View Channels
- Read Message History
- Send Messages는 필수가 아니지만 테스트 편의를 위해 허용 가능
- Manage Threads는 불필요
- Read Messages/View Channels
- Attach Files는 불필요

### Gateway Intents

다음 Intent를 사용한다.

```ts
GatewayIntentBits.Guilds
GatewayIntentBits.GuildMessages
GatewayIntentBits.MessageContent
```

Discord Developer Portal에서 `Message Content Intent`를 활성화한다.

### 감지 대상

대상은 일반 텍스트 채널이 아니라 **포럼 채널에서 생성된 게시글 스레드**다.

주요 이벤트:

```ts
Events.ThreadCreate
Events.MessageCreate
```

권장 처리 방식:

1. `threadCreate`에서 새 포럼 게시글을 감지
2. 부모 채널 ID가 `DISCORD_QR_FORUM_CHANNEL_ID`와 같은지 확인
3. 짧은 지연 후 `thread.fetchStarterMessage()` 실행
4. 시작 메시지의 첨부 이미지와 작성자를 확인
5. 게시글 생성 직후 이미지가 아직 없을 경우 `messageCreate`에서도 다시 검사
6. 조건 충족 시 Slack 전송

---

## 8. Slack 앱 설정

### 필요한 Bot Token Scopes

공개 채널 기준:

```text
chat:write
channels:history
channels:read
```

봇이 채널에 들어가야 하는 환경이라면 Slack에서 다음 명령으로 초대한다.

```text
/invite @QR업로드봇
```

비공개 채널이라면 다음 권한도 고려한다.

```text
groups:history
groups:read
```

### Slack 메시지 탐색 방식

`search.messages`는 사용하지 않는다.

대신 지정된 채널에 대해:

```ts
client.conversations.history({
  channel: SLACK_DAILY_CHANNEL_ID,
  limit: 100
})
```

를 호출하고 애플리케이션 코드에서 다음 조건으로 부모 메시지를 찾는다.

- 오늘 생성된 메시지
- 스레드 댓글이 아닌 부모 메시지
- 메시지 본문에 `[AI_11기]` 포함
- 메시지 본문에 `QR 코드` 포함
- 가능하면 `로그대조`도 포함
- 여러 개일 경우 가장 최근 메시지 선택

찾은 메시지의 `ts`를 `thread_ts`로 사용한다.

Slack 댓글 작성:

```ts
client.chat.postMessage({
  channel: SLACK_DAILY_CHANNEL_ID,
  thread_ts: parentMessage.ts,
  text: formattedMessage
})
```

---

## 9. 기수 판별

MVP에서는 기수를 자동 추론하지 않는다.

다음 환경변수로 고정한다.

```env
COHORT_NAME=AI_11기
```

확장 시 아래 매핑 구조로 변경할 수 있다.

```ts
type CohortMapping = {
  cohortName: string;
  discordForumChannelId: string;
  slackChannelId: string;
};
```

예시:

```ts
const cohortMappings: CohortMapping[] = [
  {
    cohortName: "AI_11기",
    discordForumChannelId: "123456789012345678",
    slackChannelId: "C0123456789",
  },
];
```

---

## 10. Discord 게시글 유효성 검사

다음 조건을 모두 만족해야 Slack에 전송한다.

```text
1. 해당 스레드의 parentId가 지정 QR 포럼 채널 ID와 동일
2. 게시글 제목에 "QR코드" 또는 "QR 코드" 포함
3. 시작 메시지를 가져올 수 있음
4. 이미지 첨부파일이 1개 이상 존재
5. 아직 처리하지 않은 Discord thread ID
```

이미지 판별:

```ts
const imageAttachments = [...message.attachments.values()].filter((attachment) => {
  return attachment.contentType?.startsWith("image/");
});
```

`contentType`이 없는 경우 확장자로 보완한다.

허용 확장자:

```text
.png
.jpg
.jpeg
.webp
.gif
```

QR코드 이미지 내부를 실제로 분석하거나 QR을 디코딩하지 않는다.  
이번 MVP에서는 **이미지 첨부 여부만 확인**한다.

---

## 11. 작성자 추적

작성자는 포럼 게시글의 시작 메시지 작성자를 기준으로 한다.

우선순위:

```text
1. 서버 별명(member.displayName)
2. Discord 글로벌 표시 이름(author.globalName)
3. Discord 사용자명(author.username)
```

예시 함수:

```ts
function getDisplayAuthorName(message: Message): string {
  return (
    message.member?.displayName ??
    message.author.globalName ??
    message.author.username
  );
}
```

추가로 로그에는 Discord user ID도 기록한다.

```text
authorName=홍길동
authorId=123456789012345678
```

Slack 메시지에는 사용자 ID를 노출하지 않는다.

---

## 12. 날짜와 시간 형식

기준 시간대:

```text
Asia/Seoul
```

게시글 제목은 Discord 스레드 이름을 그대로 사용한다.

```text
7월 21일(화) QR코드
```

업로드 시간은 시작 메시지의 `createdAt`을 기준으로 한다.

형식:

```text
오전 8:30
오후 1:05
```

시간 포맷 예시:

```ts
new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
}).format(date);
```

Slack의 부모 메시지를 찾을 때도 `Asia/Seoul` 기준으로 오늘 여부를 판별한다.

---

## 13. Slack 댓글 포맷

반드시 다음 형식을 기본값으로 사용한다.

```text
✅ 디스코드 QR코드 업로드 완료

• 기수: AI_11기
• 채널: 📸QR코드
• 게시글: 7월 21일(화) QR코드
• 작성자: 홍길동
• 업로드 시간: 오전 8:30
• 첨부 이미지: 1개
```

Slack mrkdwn 호환을 위해 별도의 복잡한 Block Kit은 사용하지 않는다.  
MVP는 일반 `text` 메시지로 전송한다.

포맷 함수 예시:

```ts
type QrUploadData = {
  cohortName: string;
  channelName: string;
  threadTitle: string;
  authorName: string;
  uploadedAt: Date;
  imageCount: number;
};

export function formatSlackQrUploadMessage(data: QrUploadData): string {
  const uploadedTime = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(data.uploadedAt);

  return [
    "✅ 디스코드 QR코드 업로드 완료",
    "",
    `• 기수: ${data.cohortName}`,
    `• 채널: ${data.channelName}`,
    `• 게시글: ${data.threadTitle}`,
    `• 작성자: ${data.authorName}`,
    `• 업로드 시간: ${uploadedTime}`,
    `• 첨부 이미지: ${data.imageCount}개`,
  ].join("\n");
}
```

---

## 14. 중복 방지

Discord 포럼 게시글의 thread ID를 고유 키로 사용한다.

SQLite 테이블:

```sql
CREATE TABLE IF NOT EXISTS processed_threads (
  discord_thread_id TEXT PRIMARY KEY,
  discord_starter_message_id TEXT,
  cohort_name TEXT NOT NULL,
  slack_channel_id TEXT NOT NULL,
  slack_parent_ts TEXT NOT NULL,
  slack_reply_ts TEXT,
  author_id TEXT,
  author_name TEXT,
  image_count INTEGER NOT NULL,
  processed_at TEXT NOT NULL
);
```

처리 흐름:

```text
1. thread ID가 DB에 존재하는지 조회
2. 존재하면 처리 종료
3. Slack 댓글 작성
4. Slack 작성 성공 후 DB 저장
```

Slack 전송에 실패한 경우 DB에 성공 처리하지 않는다.

동시 이벤트로 `threadCreate`와 `messageCreate`가 함께 발생할 수 있으므로, 메모리 기반 lock도 사용한다.

예시:

```ts
const processingThreads = new Set<string>();
```

---

## 15. 핵심 처리 흐름

```text
Discord 로그인
↓
새 포럼 게시글 또는 스레드 메시지 이벤트 수신
↓
QR 포럼 채널인지 확인
↓
처리 중 또는 처리 완료 게시글인지 확인
↓
시작 메시지 조회
↓
제목에 QR코드 포함 여부 확인
↓
첨부 이미지 1개 이상인지 확인
↓
작성자·시간·이미지 개수 추출
↓
Slack #일일업무 최근 메시지 조회
↓
오늘 생성된 [AI_11기] QR 코드 부모 메시지 탐색
↓
부모 메시지 ts 획득
↓
Slack 스레드 댓글 작성
↓
SQLite에 처리 결과 저장
↓
성공 로그 출력
```

---

## 16. 재시도 정책

Discord 게시글 생성 직후 시작 메시지나 첨부파일 조회가 늦을 수 있다.

다음 간격으로 최대 3회 검사한다.

```text
1차: 즉시
2차: 2초 후
3차: 5초 후
```

이미지가 없으면 Slack에 전송하지 않는다.

Slack 부모 메시지를 찾지 못한 경우:

```text
- 즉시 실패 처리하지 않고 3회 재시도
- 10초 후
- 30초 후
- 60초 후
```

그래도 찾지 못하면 오류 로그를 남기고 종료한다.

MVP에서는 별도 실패 큐는 만들지 않는다.

---

## 17. 로그 예시

성공:

```text
[INFO] Discord QR post detected
guildId=...
threadId=...
threadTitle="7월 21일(화) QR코드"
authorName="홍길동"
imageCount=1
```

```text
[INFO] Slack parent message found
cohort="AI_11기"
channelId="C0123456789"
parentTs="1784593820.654321"
```

```text
[INFO] Slack thread reply posted successfully
threadId=...
replyTs="1784593900.123456"
```

실패:

```text
[WARN] QR post ignored because no image attachment was found
threadId=...
```

```text
[ERROR] Slack parent message not found for today
cohort="AI_11기"
channelId="C0123456789"
```

토큰과 민감한 값은 로그에 출력하지 않는다.

---

## 18. 설정 검증

앱 시작 시 필수 환경변수를 검증한다.

누락 시 다음처럼 종료한다.

```text
Missing required environment variable: DISCORD_BOT_TOKEN
```

검증 대상:

```text
DISCORD_BOT_TOKEN
DISCORD_GUILD_ID
DISCORD_QR_FORUM_CHANNEL_ID
SLACK_BOT_TOKEN
SLACK_DAILY_CHANNEL_ID
COHORT_NAME
TIMEZONE
DATABASE_PATH
```

---

## 19. 테스트 시나리오

### 정상 동작

1. 테스트 Slack `#일일업무` 채널에 다음 부모 메시지 작성

```text
[AI_11기] QR 코드 / 로그대조 / 특이사항을 남겨주세요
```

2. Discord `📸QR코드` 포럼에 새 게시글 작성

```text
7월 21일(화) QR코드
```

3. QR 이미지 1개 첨부
4. Slack 부모 메시지 스레드에 자동 댓글 생성 확인
5. 작성자 이름, 업로드 시간, 이미지 개수 확인

### 중복 방지

1. 같은 Discord 게시글에 댓글 추가
2. Slack에 동일 완료 댓글이 추가로 생성되지 않아야 함
3. 앱 재시작 후 같은 게시글 이벤트를 다시 처리해도 중복되지 않아야 함

### 이미지 없음

1. 제목만 `QR코드`인 게시글 생성
2. 이미지 미첨부
3. Slack 댓글이 생성되지 않아야 함

### 잘못된 채널

1. 다른 Discord 포럼 채널에 QR 제목 게시글 생성
2. Slack 댓글이 생성되지 않아야 함

### 잘못된 제목

1. 지정 QR 포럼 채널에 `오늘 공지` 게시글 생성
2. 이미지 첨부
3. Slack 댓글이 생성되지 않아야 함

### Slack 부모 메시지 없음

1. 오늘 날짜의 `[AI_11기] QR 코드` 부모 메시지를 만들지 않음
2. Discord QR 게시글 생성
3. 재시도 후 오류 로그가 남아야 함
4. DB에는 처리 완료로 저장되지 않아야 함

---

## 20. 완료 조건

아래 조건을 모두 만족하면 MVP 완료로 판단한다.

- [ ] Discord 포럼 채널의 새 QR 게시글을 감지한다.
- [ ] 게시글 작성자 이름을 추출한다.
- [ ] 이미지 첨부 개수를 정확히 계산한다.
- [ ] 오늘 생성된 Slack의 해당 기수 부모 메시지를 찾는다.
- [ ] 정확한 Slack 스레드에 댓글을 작성한다.
- [ ] 댓글 형식이 명세와 일치한다.
- [ ] 같은 Discord 게시글은 한 번만 처리한다.
- [ ] 앱을 재시작해도 중복 댓글이 작성되지 않는다.
- [ ] 토큰을 코드에 하드코딩하지 않는다.
- [ ] 오류 발생 시 원인을 확인할 수 있는 로그를 남긴다.

---

## 21. 구현 시 주의사항

- Discord 사용자 계정 토큰을 사용하는 self-bot 방식은 사용하지 않는다.
- 반드시 공식 Discord Bot 계정을 사용한다.
- Slack Incoming Webhook만으로는 임의의 기존 메시지 스레드를 검색하고 선택하기 불편하므로 Slack Web API와 Bot Token을 사용한다.
- Slack 부모 메시지는 전체 워크스페이스 검색 대신 지정 채널의 최근 메시지만 조회한다.
- Slack 봇이 대상 채널의 메시지를 읽고 댓글을 쓸 수 있도록 채널에 초대한다.
- Discord 포럼 게시글의 제목은 `thread.name`을 사용한다.
- 시작 메시지 작성자와 첨부파일은 `thread.fetchStarterMessage()` 결과를 기준으로 한다.
- 이벤트 순서가 일정하지 않으므로 `threadCreate`와 `messageCreate`를 모두 처리하되 중복 방지를 적용한다.
- 날짜 비교는 서버 로컬 시간이 아닌 `Asia/Seoul` 기준으로 수행한다.
- QR 이미지 자체의 내용 분석은 하지 않는다.

---

## 22. OpenCode 작업 지시

다음 순서로 개발한다.

```text
1. TypeScript Node.js 프로젝트 초기화
2. 환경변수 로더 및 검증 구현
3. SQLite 초기화와 processed_threads 테이블 구현
4. Slack 최근 메시지 조회 및 부모 메시지 찾기 구현
5. Slack 스레드 댓글 작성 구현
6. Discord 포럼 게시글 감지 구현
7. 시작 메시지와 이미지 첨부 추출 구현
8. 작성자 표시 이름 추출 구현
9. Slack 메시지 포맷 구현
10. 중복 방지와 processing lock 구현
11. 재시도 로직 구현
12. README와 실행 방법 작성
13. lint/typecheck 실행
14. 테스트 절차를 README에 추가
```

코드는 작은 함수로 분리하고 모든 외부 API 호출에 예외 처리를 적용한다.

`npm run dev`, `npm run build`, `npm run start`, `npm run typecheck` 스크립트를 제공한다.

권장 `package.json` scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## 23. 향후 확장 아이디어

MVP가 안정적으로 작동한 다음에만 고려한다.

- 여러 기수 동시 지원
- 여러 Discord 포럼 채널 매핑
- Slack 원본 메시지 링크 저장
- Discord 원문 바로가기 추가
- QR 게시글 수정 시 Slack 후속 댓글
- 이미지 재업로드 감지
- 업로드 누락 알림
- 관리자 대시보드
- CM Assistant와 통합
