import type { MemberOnboardingConfigDto } from "@/lib/api/contracts/admin"
import type {
  MemberOnboardingPageFormValues,
  MemberOnboardingSettingsFormValues,
} from "@/lib/schemas"

export function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }

  return `page_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function applyLinePrefix(
  value: string,
  start: number,
  end: number,
  prefix: string,
): { value: string; cursor: number } {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1
  const lineContent = value.slice(lineStart, end)

  if (lineContent.startsWith(prefix)) {
    return {
      value:
        value.slice(0, lineStart) +
        lineContent.slice(prefix.length) +
        value.slice(end),
      cursor: Math.max(lineStart, start - prefix.length),
    }
  }

  return {
    value: value.slice(0, lineStart) + prefix + value.slice(lineStart),
    cursor: start + prefix.length,
  }
}

export function mapConfigToFormValues(
  config: MemberOnboardingConfigDto,
): MemberOnboardingSettingsFormValues {
  return {
    enabled: config.enabled,
    pages: config.pages.map(
      (page: MemberOnboardingConfigDto["pages"][number]) => ({
        id: page.id,
        title: page.title,
        markdown: page.markdown,
      }),
    ),
  }
}

export function mapFormValuesToConfig(
  values: MemberOnboardingSettingsFormValues,
): MemberOnboardingConfigDto {
  return {
    enabled: values.enabled,
    pages: values.pages.map((page: MemberOnboardingPageFormValues) => ({
      id: page.id,
      title: page.title.trim(),
      markdown: page.markdown.trim(),
    })),
  }
}

export function areMemberOnboardingValuesEqual(
  left: MemberOnboardingSettingsFormValues,
  right: MemberOnboardingSettingsFormValues,
): boolean {
  if (
    left.enabled !== right.enabled ||
    left.pages.length !== right.pages.length
  ) {
    return false
  }

  return left.pages.every((page, index) => {
    const otherPage = right.pages[index]
    return (
      otherPage !== undefined &&
      page.id === otherPage.id &&
      page.title === otherPage.title &&
      page.markdown === otherPage.markdown
    )
  })
}

export function moveItem<T>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (toIndex < 0 || toIndex >= items.length) {
    return items
  }

  const nextItems = [...items]
  const [item] = nextItems.splice(fromIndex, 1)
  if (!item) {
    return items
  }

  nextItems.splice(toIndex, 0, item)
  return nextItems
}
