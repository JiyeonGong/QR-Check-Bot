# CM Safety Bot v2 설계 문서

## 1. 프로젝트 목적

CM Safety Bot은 단순한 QR 업로드 알림 봇이 아니라, 클래스매니저가 QR코드를 잘못된 Discord 채널이나 다른 기수 채널에 업로드하는 사고를 예방하는 검증 봇이다.

핵심 질문은 다음과 같다.

1. QR코드가 업로드되었는가?
2. 올바른 기수의 올바른 채널과 스레드에 업로드되었는가?
3. 다른 채널이나 다른 기수 채널에 잘못 업로드되지는 않았는가?
4. 정해진 시각까지 정상 업로드가 누락되지는 않았는가?
5. 결과가 Slack의 올바른 일일업무 스레드에 남았는가?

이번 버전은 4개 과정으로 테스트하되, 정식 적용 시 20개 이상으로 확장 가능해야 한다.

---

## 2. 테스트 대상 4개 과정

예시:

- AI_11기
- PD_22기
- DA_8기
- FE_15기

실제 과정명과 ID는 설정 파일에서 교체한다. 과정 추가 시 코드를 수정하지 않고 설정만 추가할 수 있어야 한다.

---

## 3. 현재 Discord 구조

```text
부모 텍스트 채널
└─ 원본 공지 메시지
   └─ 공개 스레드: 📢 출결 QR 스캔 안내
      ├─ 7월 21일(화) QR코드 + QR 이미지
      ├─ 외출 댓글
      ├─ 복귀 댓글
      └─ 기타 출결 메시지
```

QR 메시지는 스레드의 starter message가 아니다. 따라서 `thread.fetchStarterMessage()`가 아니라 `Events.MessageCreate`로 스레드 내부의 새 메시지를 감지한다.

---

## 4. 시스템 구조

```text
Discord Gateway
  ↓ messageCreate
CM Safety Bot
  ↓ 빠른 필터링
QR 후보 판별
  ↓
정상 업로드 / 오업로드 / 미업로드
  ↓
Slack Web API
  ↓
기수별 일일업무 부모 메시지의 스레드에 댓글
```

권장 기술:

- Node.js 20+
- TypeScript
- discord.js
- @slack/web-api
- better-sqlite3
- node-cron
- dotenv

---

## 5. 권장 프로젝트 구조

```text
cm-safety-bot/
├─ src/
│  ├─ index.ts
│  ├─ config.ts
│  ├─ discord/
│  │  ├─ client.ts
│  │  ├─ message-handler.ts
│  │  └─ qr-detector.ts
│  ├─ slack/
│  │  ├─ client.ts
│  │  ├─ parent-message-finder.ts
│  │  └─ reporter.ts
│  ├─ services/
│  │  ├─ qr-validation.service.ts
│  │  ├─ upload-status.service.ts
│  │  └─ missing-upload.service.ts
│  ├─ storage/
│  │  ├─ database.ts
│  │  └─ repositories.ts
│  ├─ utils/
│  │  ├─ date.ts
│  │  ├─ discord-url.ts
│  │  └─ logger.ts
│  └─ types.ts
├─ config/
│  └─ cohorts.json
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

```env
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=

SLACK_BOT_TOKEN=
SLACK_DAILY_CHANNEL_ID=

TIMEZONE=Asia/Seoul
DATABASE_PATH=./data/bot.db

QR_MONITOR_START_HOUR=7
QR_MONITOR_END_HOUR=10
QR_MISSING_CHECK_TIME=08:50

LOG_LEVEL=info
```

정식 적용 시 회사 환경의 토큰, 서버 ID, Slack 채널 ID만 교체한다.

---

## 7. 과정 설정

`config/cohorts.json`

```json
[
  {
    "id": "ai-11",
    "cohortName": "AI_11기",
    "discordParentChannelId": "DISCORD_PARENT_CHANNEL_ID_1",
    "discordThreadName": "📢 출결 QR 스캔 안내",
    "managerIds": ["DISCORD_MANAGER_USER_ID_1"],
    "slackParentMessageKeyword": "[AI_11기]",
    "active": true
  },
  {
    "id": "pd-22",
    "cohortName": "PD_22기",
    "discordParentChannelId": "DISCORD_PARENT_CHANNEL_ID_2",
    "discordThreadName": "📢 출결 QR 스캔 안내",
    "managerIds": ["DISCORD_MANAGER_USER_ID_2"],
    "slackParentMessageKeyword": "[PD_22기]",
    "active": true
  },
  {
    "id": "da-8",
    "cohortName": "DA_8기",
    "discordParentChannelId": "DISCORD_PARENT_CHANNEL_ID_3",
    "discordThreadName": "📢 출결 QR 스캔 안내",
    "managerIds": ["DISCORD_MANAGER_USER_ID_3"],
    "slackParentMessageKeyword": "[DA_8기]",
    "active": true
  },
  {
    "id": "fe-15",
    "cohortName": "FE_15기",
    "discordParentChannelId": "DISCORD_PARENT_CHANNEL_ID_4",
    "discordThreadName": "📢 출결 QR 스캔 안내",
    "managerIds": ["DISCORD_MANAGER_USER_ID_4"],
    "slackParentMessageKeyword": "[FE_15기]",
    "active": true
  }
]
```

정식 적용 시 이 파일만 수정하면 된다.

---

## 8. 성능 설계

봇은 과거 메시지를 계속 검색하지 않는다. Discord의 새 메시지 이벤트 한 건만 처리한다.

필터 순서:

```text
1. 봇 메시지인가? → 종료
2. 등록된 CM인가? → 아니면 종료
3. 이미지가 있는가? → 아니면 종료
4. 메시지에 QR 또는 QR코드가 있는가? → 아니면 종료
5. 정상 위치인가? → 정상 또는 오업로드 판정
```

등록 CM ID는 `Set`, 부모 채널 매핑은 `Map`으로 관리한다.

```ts
const registeredManagerIds = new Set<string>();
const cohortByParentChannelId = new Map<string, CohortConfig>();
```

20개 이상의 과정에서도 충분히 가볍게 동작해야 한다.

---

## 9. QR 후보 판별

```ts
const QR_TEXT_PATTERN = /QR\s*코드|QR/i;

const isQrCandidate =
  registeredManagerIds.has(message.author.id) &&
  imageAttachments.length > 0 &&
  QR_TEXT_PATTERN.test(message.content);
```

선택적으로 날짜 형식도 검사할 수 있다.

```ts
const DATE_QR_PATTERN =
  /#?\s*\d{1,2}월\s*\d{1,2}일(?:\([월화수목금토일]\))?\s*QR\s*코드/i;
```

QR 이미지 자체를 다운로드하거나 디코딩하지 않는다.

---

## 10. 정상 업로드 판정

```ts
const isCorrectLocation =
  message.channel.isThread() &&
  message.channel.parentId === cohort.discordParentChannelId &&
  message.channel.name === cohort.discordThreadName;
```

정상 Slack 메시지:

```text
✅ 디스코드 QR코드 정상 업로드 확인

• 기수: AI_11기
• 채널: 📢 출결 QR 스캔 안내
• 게시글: 7월 21일(화) QR코드 ↗
• 작성자: 클래스매니저_공지연
• 업로드 시간: 오전 8:30
• 첨부 이미지: 1개
```

Discord 링크:

```ts
const discordMessageUrl =
  `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;
```

Slack mrkdwn:

```ts
`• 게시글: <${discordMessageUrl}|${cleanTitle} ↗>`
```

---

## 11. 오업로드 감지

QR 후보인데 정상 위치가 아니면 오업로드로 판정한다.

대상:

- 다른 일반 채널
- 다른 스레드
- 다른 기수 채널
- 정상 부모 채널이 아닌 위치

Slack 경고:

```text
🚨 QR코드 오업로드 의심

• 기수: AI_11기
• 실제 업로드 위치: #자유게시판
• 정상 위치: 📸QR코드 → 📢 출결 QR 스캔 안내
• 게시글: 7월 21일(화) QR코드 ↗
• 작성자: 클래스매니저_공지연
• 업로드 시간: 오전 8:28
• 첨부 이미지: 1개

즉시 Discord 원문을 확인해 주세요.
```

한 CM이 여러 기수를 담당해 기수 판별이 모호하면 후보 기수를 모두 표시하거나 우선순위 설정을 사용한다.

---

## 12. 미업로드 감지

평일 오전 8:50까지 정상 업로드가 없는 과정에 경고한다.

```text
⚠️ QR코드 미업로드 확인 필요

• 기수: PD_22기
• 확인 시각: 오전 8:50
• 정상 위치: 📸QR코드 → 📢 출결 QR 스캔 안내

오늘 정상 QR 업로드가 아직 확인되지 않았습니다.
```

중복 경고 방지를 위해 날짜 + 기수 기준으로 하루 한 번만 보낸다.

---

## 13. 감시 시간대

권장 정책:

```text
정상 위치 QR 업로드
→ 하루 종일 감지

오업로드 의심 감지
→ 오전 7:00~10:00

미업로드 검사
→ 평일 오전 8:50
```

시간대 제한은 성능보다 오탐 감소를 위한 것이다.

---

## 14. Slack 부모 메시지 탐색

Slack 일일업무 채널에서 오늘 생성된 부모 메시지를 찾는다.

조건:

```text
오늘 생성
+
스레드 댓글이 아닌 부모 메시지
+
기수 키워드 포함
+
QR 코드 포함
```

예:

```text
[AI_11기] QR 코드 / 로그대조 / 특이사항을 남겨주세요
```

여러 개면 가장 최근 메시지를 사용한다.

Slack 전송 시:

```ts
unfurl_links: false,
unfurl_media: false
```

---

## 15. 데이터베이스

```sql
CREATE TABLE IF NOT EXISTS qr_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_message_id TEXT NOT NULL UNIQUE,
  discord_channel_id TEXT NOT NULL,
  discord_thread_id TEXT,
  discord_author_id TEXT NOT NULL,
  cohort_id TEXT,
  event_type TEXT NOT NULL,
  message_title TEXT,
  discord_message_url TEXT,
  image_count INTEGER NOT NULL,
  slack_channel_id TEXT,
  slack_parent_ts TEXT,
  slack_reply_ts TEXT,
  created_at TEXT NOT NULL
);
```

`event_type`:

```text
normal
misplaced
missing
```

일일 상태:

```sql
CREATE TABLE IF NOT EXISTS daily_cohort_status (
  status_date TEXT NOT NULL,
  cohort_id TEXT NOT NULL,
  normal_upload_detected INTEGER NOT NULL DEFAULT 0,
  normal_upload_message_id TEXT,
  misplaced_upload_detected INTEGER NOT NULL DEFAULT 0,
  missing_alert_sent INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (status_date, cohort_id)
);
```

---

## 16. 중복 방지

정상 및 오업로드:

```text
Discord message ID
```

미업로드:

```text
날짜 + 기수 ID
```

Slack 전송 성공 후 DB에 저장한다.

---

## 17. 테스트 시나리오

### 정상 업로드
정상 채널과 스레드에 QR 업로드 → 정상 Slack 댓글

### 다른 채널 오업로드
자유게시판에 QR 업로드 → 오업로드 Slack 경고

### 다른 기수 채널 오업로드
AI_11기 담당자가 PD_22기 채널에 업로드 → AI_11기 오업로드 경고

### 미업로드
오전 8:50까지 정상 업로드 없음 → 미업로드 경고

### 일반 이미지
등록 CM이 일반 이미지를 올렸지만 QR 문구 없음 → 무시

### 수강생 메시지
수강생이 QR 이미지와 문구 게시 → 등록 CM이 아니므로 무시

### 중복
동일 Discord 메시지 이벤트 재수신 → 두 번째 Slack 전송 없음

---

## 18. 완료 조건

- [ ] 4개 과정 설정을 JSON에서 읽는다.
- [ ] 등록 CM만 빠르게 필터링한다.
- [ ] 정상 QR 업로드를 감지한다.
- [ ] 잘못된 위치의 QR 업로드를 감지한다.
- [ ] 정상 및 오업로드 메시지에 Discord 원문 링크가 포함된다.
- [ ] 올바른 Slack 일일업무 스레드에 댓글을 작성한다.
- [ ] 오전 지정 시각 미업로드 경고를 전송한다.
- [ ] 중복 전송을 방지한다.
- [ ] Asia/Seoul 기준으로 시간을 표시한다.
- [ ] 20개 이상 과정으로 코드 수정 없이 확장 가능하다.
- [ ] 토큰과 민감정보를 로그에 출력하지 않는다.
- [ ] `.env`가 Git에서 제외된다.

---

## 19. 정식 적용 시 수정할 항목

정식 배포 시 다음만 교체한다.

1. `config/cohorts.json`
   - 실제 과정명
   - Discord 부모 채널 ID
   - CM Discord 사용자 ID
   - Slack 기수 키워드

2. `.env`
   - 회사 Discord Bot Token
   - 회사 Slack Bot Token
   - 회사 Discord Guild ID
   - 회사 Slack 일일업무 채널 ID
   - 감시 시간대
   - 미업로드 확인 시각

3. 회사 Slack 관리자 승인

4. 회사 Discord 서버에 봇 초대 및 채널 보기 권한 부여

코드 자체는 수정하지 않는 것을 목표로 한다.

---

## 20. OpenCode 구현 프롬프트

```text
현재 프로젝트는 Discord의 지정 스레드에 QR코드 이미지가 업로드되면 Slack의 해당 기수 일일업무 부모 메시지 스레드에 정상 완료 댓글을 작성하는 기능까지 구현되어 있습니다.

이제 프로젝트를 CM Safety Bot v2로 확장해 주세요.

목표는 클래스매니저가 QR코드를 정상 채널이 아닌 다른 Discord 채널이나 다른 기수 채널에 실수로 업로드했을 때 이를 즉시 감지하고 Slack에 경고하는 것입니다.

우선 4개 과정만 운영하되, 이후 20개 이상의 과정으로 코드 수정 없이 확장할 수 있어야 합니다.

구현 요구사항:

1. 과정별 설정은 config/cohorts.json으로 분리합니다.
2. 각 과정 설정에는 cohortName, discordParentChannelId, discordThreadName, managerIds, slackParentMessageKeyword, active를 포함합니다.
3. 등록된 모든 managerIds는 Set으로 구성해 messageCreate 이벤트에서 가장 먼저 필터링합니다.
4. Discord의 과거 메시지를 검색하지 말고 새 messageCreate 이벤트만 처리합니다.
5. 처리 순서는 봇 메시지 제외 → 등록 CM 여부 → 이미지 첨부 여부 → QR 또는 QR코드 문구 여부 → 정상 위치 여부입니다.
6. 정상 위치 조건은 message.channel.isThread(), parentId 일치, thread name 일치입니다.
7. 정상 위치면 기존 정상 업로드 완료 메시지를 Slack에 작성합니다.
8. QR 후보인데 정상 위치가 아니면 Slack에 `🚨 QR코드 오업로드 의심` 경고를 작성합니다.
9. 오업로드 경고에는 기수, 실제 업로드 위치, 정상 위치, 게시글 제목, 작성자, 업로드 시간, 이미지 수, Discord 원문 링크를 포함합니다.
10. Discord 원문 링크는 `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`로 생성합니다.
11. Slack에서는 게시글 제목 전체에 링크를 걸고 `↗`를 붙입니다.
12. Slack 전송 시 unfurl_links와 unfurl_media를 false로 설정합니다.
13. 평일 오전 8:50까지 정상 업로드가 없는 과정에는 `⚠️ QR코드 미업로드 확인 필요` 경고를 하루 한 번 작성합니다.
14. 감시 시간대는 .env의 QR_MONITOR_START_HOUR, QR_MONITOR_END_HOUR로 관리합니다.
15. 정상 업로드는 시간대 밖에서도 감지하고, 오업로드 의심 검사는 기본적으로 오전 감시 시간대에만 동작시킵니다.
16. SQLite에 normal, misplaced, missing 이벤트를 저장하고 Discord message ID 및 날짜+기수 기준으로 중복을 막습니다.
17. 4개 과정 테스트용 설정 예시를 작성합니다.
18. 정식 적용 시 config/cohorts.json과 .env만 교체하면 되도록 README에 이전 절차를 정리합니다.
19. 현재 정상 업로드 기능은 깨뜨리지 말고 회귀 테스트를 포함합니다.
20. TypeScript 타입을 명확하게 정의하고 기능을 작은 함수와 서비스 단위로 분리합니다.

구현 후 npm run typecheck, npm run build를 실행하고 정상 업로드, 다른 채널 오업로드, 다른 기수 채널 오업로드, 미업로드, 일반 이미지 무시, 수강생 메시지 무시, 중복 방지 시나리오를 검증해 주세요.
```
