export function isTodayInTimeZone(date: Date, timeZone: string): boolean {
  return getDateKey(date, timeZone) === getDateKey(new Date(), timeZone);
}

export function getDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function getHourInTimeZone(date: Date, timeZone: string): number {
  return getTimePartsInTimeZone(date, timeZone).hour;
}

export function isAtOrAfterTimeInTimeZone(
  date: Date,
  timeZone: string,
  target: { hour: number; minute: number },
): boolean {
  const current = getTimePartsInTimeZone(date, timeZone);
  return current.hour > target.hour || (current.hour === target.hour && current.minute >= target.minute);
}

export function isWeekdayInTimeZone(date: Date, timeZone: string): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);

  return weekday !== "Sat" && weekday !== "Sun";
}

export function toCronTime(time: string): { hour: number; minute: number } {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error(`Invalid time format: ${time}`);
  }

  return { hour, minute };
}

function getTimePartsInTimeZone(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);

  return { hour, minute };
}
