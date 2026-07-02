"use client"

import { CalendarIcon, XIcon } from "lucide-react"
import { forwardRef, useImperativeHandle, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { getDateFnsLocale, useLocale, useTranslations } from "@/lib/i18n"
import { cn, formatDate, formatTime } from "@/lib/utils"

type Meridiem = "am" | "pm"

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function getDefaultTime(sourceDate: Date, minutesAhead: number): Date {
  const defaultTime = new Date(Date.now() + minutesAhead * 60 * 1000)
  defaultTime.setSeconds(0, 0)

  const nextDate = new Date(sourceDate)
  nextDate.setHours(defaultTime.getHours(), defaultTime.getMinutes(), 0, 0)
  return nextDate
}

function getLocaleUses12HourClock(locale: string): boolean {
  return (
    new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions()
      .hour12 ?? false
  )
}

function getLocaleDayPeriodLabel(locale: string, hour: number): string {
  const parts = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    hour12: true,
  }).formatToParts(new Date(2020, 0, 1, hour, 0))

  return (
    parts.find((part) => part.type === "dayPeriod")?.value ??
    (hour < 12 ? "AM" : "PM")
  )
}

function applyTimeToDate(date: Date, hours: number, minutes: number): Date {
  const nextDate = new Date(date)
  nextDate.setHours(hours, minutes, 0, 0)
  return nextDate
}

function toMeridiem(hours: number): Meridiem {
  return hours >= 12 ? "pm" : "am"
}

function to12HourDisplay(hours: number): number {
  return hours % 12 || 12
}

function to24Hour(hour12: number, meridiem: Meridiem): number {
  const normalized = hour12 % 12
  return meridiem === "pm" ? normalized + 12 : normalized
}

function coerceToMinimum(value: Date, minimum: Date): Date {
  if (isSameDay(value, minimum) && value < minimum) {
    return new Date(minimum)
  }
  return value
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function formatDateTimeValue(date: Date, locale: string): string {
  return `${formatDate(date, locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}, ${formatTime(date, locale)}`
}

const timeInputStyles = cn(
  "h-9 w-10 rounded-md border border-input bg-transparent text-center text-sm tabular-nums shadow-xs outline-none transition-[color,box-shadow]",
  "placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  "disabled:pointer-events-none disabled:opacity-50",
  "dark:bg-input/30",
)

interface TimeInputProps {
  value: string
  disabled?: boolean
  ariaLabel?: string
  onCommit: (value: number) => void
  onAdvance?: () => void
  min: number
  max: number
}

const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(
  function TimeInput(
    { value, disabled, ariaLabel, onCommit, onAdvance, min, max },
    forwardedRef,
  ) {
    const [draft, setDraft] = useState<string | null>(null)
    const innerRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(forwardedRef, () => innerRef.current!)

    const displayed = draft ?? value

    function commit(raw: string) {
      setDraft(null)
      const parsed = Number.parseInt(raw, 10)
      if (Number.isNaN(parsed)) return
      onCommit(clamp(parsed, min, max))
    }

    return (
      <input
        ref={innerRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        className={timeInputStyles}
        value={displayed}
        disabled={disabled}
        aria-label={ariaLabel}
        onFocus={() => innerRef.current?.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").slice(0, 2)
          setDraft(raw)

          if (raw.length === 2) {
            commit(raw)
            onAdvance?.()
          }
        }}
        onBlur={(e) => {
          if (draft !== null) {
            commit(e.target.value)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(e.currentTarget.value)
            onAdvance?.()
          }
        }}
      />
    )
  },
)

const DEFAULT_MINUTES_AHEAD = 15

interface DateTimePickerProps {
  /** The currently selected date, or null for "no date". */
  value: Date | null
  /** Called when the value changes. Receives `null` when cleared. */
  onChange: (value: Date | null) => void
  /**
   * Text shown on the trigger button when no date is selected.
   * Falls back to the `common.never` i18n key.
   */
  placeholder?: string
  /**
   * Minimum number of minutes from now that the selected time must be.
   * Dates/times before this threshold are disabled.
   * @default 15
   */
  minMinutesFromNow?: number
  /** Whether the picker trigger and controls are disabled. */
  disabled?: boolean
  /** Whether to show the clear (X) button when a value is set. @default true */
  clearable?: boolean
  /** Additional className applied to the outermost wrapper. */
  className?: string
  /** Alignment of the popover relative to the trigger. @default "start" */
  align?: "start" | "center" | "end"
}

function DateTimePicker({
  value,
  onChange,
  placeholder,
  minMinutesFromNow = DEFAULT_MINUTES_AHEAD,
  disabled = false,
  clearable = true,
  className,
  align = "start",
}: DateTimePickerProps) {
  const locale = useLocale()
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const minuteRef = useRef<HTMLInputElement>(null)

  const uses12HourClock = getLocaleUses12HourClock(locale)
  const amLabel = getLocaleDayPeriodLabel(locale, 9)
  const pmLabel = getLocaleDayPeriodLabel(locale, 21)

  // Minimum allowed date/time
  const minimumTime = new Date(Date.now() + minMinutesFromNow * 60 * 1000)
  minimumTime.setSeconds(0, 0)
  const minimumDate = new Date(minimumTime)
  minimumDate.setHours(0, 0, 0, 0)

  // Derive display values
  const hours24 = value?.getHours() ?? minimumTime.getHours()
  const minutes = value?.getMinutes() ?? minimumTime.getMinutes()
  const meridiem = toMeridiem(hours24)

  const hourDisplay = uses12HourClock
    ? to12HourDisplay(hours24).toString().padStart(2, "0")
    : hours24.toString().padStart(2, "0")
  const minuteDisplay = minutes.toString().padStart(2, "0")

  function emitTime(nextHours: number, nextMinutes: number) {
    if (!value) return
    onChange(
      coerceToMinimum(
        applyTimeToDate(value, nextHours, nextMinutes),
        minimumTime,
      ),
    )
  }

  function handleDateSelect(date: Date | undefined) {
    if (!date) {
      onChange(null)
      return
    }

    const nextValue = value
      ? applyTimeToDate(date, value.getHours(), value.getMinutes())
      : getDefaultTime(date, minMinutesFromNow)

    onChange(coerceToMinimum(nextValue, minimumTime))
  }

  function handleHourCommit(raw: number) {
    if (!value) return
    const next24 = uses12HourClock ? to24Hour(raw, meridiem) : raw
    emitTime(next24, minutes)
  }

  function handleMinuteCommit(raw: number) {
    emitTime(hours24, raw)
  }

  function handleMeridiemToggle() {
    if (!value) return
    const nextMeridiem: Meridiem = meridiem === "am" ? "pm" : "am"
    const hour12 = to12HourDisplay(hours24)
    emitTime(to24Hour(hour12, nextMeridiem), minutes)
  }

  function handleClear() {
    onChange(null)
    setOpen(false)
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "flex-1 justify-start text-left font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value
              ? formatDateTimeValue(value, locale)
              : (placeholder ?? t("common.never"))}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0 sm:w-[340px]" align={align}>
          <Calendar
            mode="single"
            selected={value ?? undefined}
            onSelect={handleDateSelect}
            disabled={(date) => date < minimumDate}
            locale={getDateFnsLocale(locale)}
          />

          {/* Time input row */}
          <div className="border-t px-3 py-3">
            <div className="flex items-center gap-1.5">
              <TimeInput
                value={hourDisplay}
                disabled={!value}
                ariaLabel={t("common.hour")}
                min={uses12HourClock ? 1 : 0}
                max={uses12HourClock ? 12 : 23}
                onCommit={handleHourCommit}
                onAdvance={() => minuteRef.current?.focus()}
              />
              <span className="text-muted-foreground text-sm font-medium select-none">
                :
              </span>
              <TimeInput
                ref={minuteRef}
                value={minuteDisplay}
                disabled={!value}
                ariaLabel={t("common.minute")}
                min={0}
                max={59}
                onCommit={handleMinuteCommit}
              />
              {uses12HourClock && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!value}
                  className="ml-1 h-9 w-12 px-0 text-xs font-medium tabular-nums"
                  onClick={handleMeridiemToggle}
                  aria-label={t("common.period")}
                >
                  {meridiem === "am" ? amLabel : pmLabel}
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Clear button */}
      {clearable && value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={handleClear}
          aria-label={t("common.clearDate")}
        >
          <XIcon className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

export { DateTimePicker, type DateTimePickerProps }
