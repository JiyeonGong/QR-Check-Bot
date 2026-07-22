# QR Check Bot

CM Safety Bot v2는 Discord QR코드 업로드를 감지해 Slack 일일업무 스레드에 정상 업로드, 오업로드 의심, 미업로드 경고를 남기는 봇입니다.

## 기능

- 등록된 클래스매니저의 새 Discord 메시지만 처리
- 이미지 첨부와 QR 문구가 있는 메시지를 QR 후보로 판별
- 과정별 정상 부모 채널/스레드에 업로드되면 Slack 정상 업로드 댓글 작성
- QR 후보가 다른 채널이나 다른 스레드에 올라오면 Slack 오업로드 경고 작성
- 평일 지정 시각까지 정상 업로드가 없으면 Slack 미업로드 경고 작성
- Discord 메시지 ID와 날짜/기수 기준으로 중복 전송 방지
- Slack 링크 미리보기 비활성화

## 설정

`.env`에는 토큰과 공통 런타임 설정만 둡니다.

```env
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=

SLACK_BOT_TOKEN=
SLACK_DAILY_CHANNEL_ID=

COHORTS_CONFIG_PATH=./config/cohorts.json
TIMEZONE=Asia/Seoul
DATABASE_PATH=./data/bot.db
QR_MONITOR_START_HOUR=7
QR_MONITOR_END_HOUR=10
QR_MISSING_CHECK_TIME=08:50
LOG_LEVEL=info
```

과정별 Discord 채널과 CM ID는 `config/cohorts.json`에서 관리합니다.

```json
{
  "id": "pd-22",
  "cohortName": "PD_22기",
  "discordParentChannelId": "부모 텍스트 채널 ID",
  "discordThreadName": "📢 출결 QR 스캔 안내",
  "managerIds": ["Discord CM user ID"],
  "slackParentMessageKeyword": "[PD_22기]",
  "active": true
}
```

정식 적용 시에는 `.env`와 `config/cohorts.json`만 교체하는 것을 목표로 합니다.

## 실행

```bash
npm install
npm run dev
```

빌드와 타입체크:

```bash
npm run typecheck
npm run build
```

## Slack 권한

공개 채널이면 다음 Bot Token Scopes가 필요합니다.

```text
chat:write
channels:history
channels:read
```

비공개 채널이면 추가로 필요합니다.

```text
groups:history
groups:read
```

봇은 대상 Slack 채널에 초대되어 있어야 합니다.

```text
/invite @봇이름
```

## 테스트 시나리오

- 정상 업로드: 등록 CM이 정상 스레드에 `7월 23일 QR코드`와 이미지를 업로드하면 Slack 정상 댓글이 생성됩니다.
- 다른 채널 오업로드: 등록 CM이 감시 시간대에 다른 채널에 QR 후보를 올리면 Slack 경고가 생성됩니다.
- 다른 기수 채널 오업로드: 등록 CM이 담당 기수와 다른 위치에 QR 후보를 올리면 Slack 경고가 생성됩니다.
- 미업로드: 평일 `QR_MISSING_CHECK_TIME`까지 정상 업로드가 없으면 과정별 Slack 경고가 하루 한 번 생성됩니다.
- 일반 이미지 무시: 등록 CM이 이미지만 올리고 QR 문구가 없으면 무시합니다.
- 수강생 메시지 무시: 등록 CM ID가 아니면 QR 문구와 이미지가 있어도 무시합니다.
- 중복 방지: 동일 Discord 메시지는 Slack에 두 번 전송되지 않습니다.

## 주의사항

- `.env`는 Git에 커밋하지 않습니다.
- Discord 사용자 토큰 self-bot 방식은 사용하지 않습니다.
- QR 이미지 내용은 디코딩하지 않고 이미지 첨부 여부만 확인합니다.
- 오업로드 감지는 `QR_MONITOR_START_HOUR` 이상, `QR_MONITOR_END_HOUR` 미만 시간대에만 동작합니다.
- 정상 업로드는 시간대와 관계없이 감지합니다.
