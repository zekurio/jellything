"use client"

import { useStore } from "@tanstack/react-store"
import {
  ArrowDown,
  ArrowUp,
  Bold,
  ChevronLeft,
  ChevronRight,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link,
  List,
  ListOrdered,
  Plus,
  Trash2,
} from "lucide-react"
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

import { FormShell } from "@/components/shared/form-shell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { createAppStore, type StateUpdater } from "@/hooks/store-utils"
import { useDashboardSettingsTabDirty } from "@/hooks/use-dashboard-settings-dirty"
import { useScopedStore } from "@/hooks/use-scoped-store"
import type { MemberOnboardingConfigDto } from "@/lib/api/contracts/admin"
import { translateMaybeMessageKey, useTranslations } from "@/lib/i18n"
import { renderMarkdown } from "@/lib/markdown"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"
import {
  memberOnboardingSettingsFormSchema,
  type MemberOnboardingPageFormValues,
  type MemberOnboardingSettingsFormValues,
} from "@/lib/schemas"
import { cn } from "@/lib/utils"

function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }

  return `page_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function applyLinePrefix(
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

function mapConfigToFormValues(
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

function mapFormValuesToConfig(
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

function areMemberOnboardingValuesEqual(
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

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
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

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") {
      return false
    }

    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const mediaQuery = window.matchMedia(query)
    const handleChange = () => {
      setMatches(mediaQuery.matches)
    }

    handleChange()
    mediaQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [query])

  return matches
}

/* -------------------------------------------------------------------------- */
/*  Toolbar Button                                                              */
/* -------------------------------------------------------------------------- */

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={onClick}
      tabIndex={-1}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  )
}

/* -------------------------------------------------------------------------- */
/*  Page Editor                                                                */
/* -------------------------------------------------------------------------- */

function PageEditor({
  page,
  pageIndex,
  t,
  updatePage,
}: {
  page: MemberOnboardingPageFormValues
  pageIndex: number
  t: ReturnType<typeof useTranslations>
  updatePage: (
    pageIndex: number,
    updater: (
      page: MemberOnboardingPageFormValues,
    ) => MemberOnboardingPageFormValues,
  ) => void
}) {
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null)
  const desktopTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor")
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
  const [linkText, setLinkText] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const savedSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const activeEditorLayoutRef = useRef<"mobile" | "desktop">("mobile")
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const activeLayout = isDesktop ? "desktop" : "mobile"
  const shouldRenderPreview = isDesktop || activeTab === "preview"
  const deferredMarkdown = useDeferredValue(page.markdown)
  const markdownPreview = useMemo(
    () => (shouldRenderPreview ? renderMarkdown(deferredMarkdown) : null),
    [deferredMarkdown, shouldRenderPreview],
  )

  const getTextareaRef = useCallback(
    (layout: "mobile" | "desktop") =>
      layout === "mobile" ? mobileTextareaRef : desktopTextareaRef,
    [],
  )

  // Wrap selected text (or insert placeholder) between two markers
  const wrapText = useCallback(
    (
      layout: "mobile" | "desktop",
      before: string,
      after: string,
      placeholder: string,
    ) => {
      const textarea = getTextareaRef(layout).current
      if (!textarea) return

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selected = textarea.value.slice(start, end)
      const inserted = before + (selected || placeholder) + after
      const newValue =
        textarea.value.slice(0, start) + inserted + textarea.value.slice(end)

      updatePage(pageIndex, (current) => ({ ...current, markdown: newValue }))

      requestAnimationFrame(() => {
        textarea.focus()
        const selectionStart = start + before.length
        const selectionEnd =
          selectionStart + (selected ? selected.length : placeholder.length)
        textarea.setSelectionRange(selectionStart, selectionEnd)
      })
    },
    [getTextareaRef, pageIndex, updatePage],
  )

  // Prefix the current line (toggles on/off)
  const prefixLine = useCallback(
    (layout: "mobile" | "desktop", prefix: string) => {
      const textarea = getTextareaRef(layout).current
      if (!textarea) return

      const { selectionStart: start, selectionEnd: end, value } = textarea
      const nextLine = applyLinePrefix(value, start, end, prefix)

      updatePage(pageIndex, (current) => ({
        ...current,
        markdown: nextLine.value,
      }))

      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(nextLine.cursor, nextLine.cursor)
      })
    },
    [getTextareaRef, pageIndex, updatePage],
  )

  const handleLinkButtonClick = useCallback(
    (layout: "mobile" | "desktop") => {
      const textarea = getTextareaRef(layout).current
      if (textarea) {
        activeEditorLayoutRef.current = layout
        savedSelectionRef.current = {
          start: textarea.selectionStart,
          end: textarea.selectionEnd,
        }
        setLinkText(
          textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
        )
        setLinkUrl("")
      }
    },
    [getTextareaRef],
  )

  const insertLink = useCallback(() => {
    const saved = savedSelectionRef.current
    if (!saved) return

    const activeTextarea = getTextareaRef(activeEditorLayoutRef.current).current
    if (!activeTextarea) return

    const { start, end } = saved
    const text = linkText || "link text"
    const url = linkUrl || "https://"
    const insertion = `[${text}](${url})`
    const newValue =
      activeTextarea.value.slice(0, start) +
      insertion +
      activeTextarea.value.slice(end)

    updatePage(pageIndex, (current) => ({ ...current, markdown: newValue }))
    setLinkPopoverOpen(false)
    setLinkText("")
    setLinkUrl("")
    savedSelectionRef.current = null

    requestAnimationFrame(() => {
      activeTextarea.focus()
      const cursorPos = start + insertion.length
      activeTextarea.setSelectionRange(cursorPos, cursorPos)
    })
  }, [getTextareaRef, linkText, linkUrl, pageIndex, updatePage])

  const renderEditorPane = (layout: "mobile" | "desktop") => (
    <div className="border-input overflow-hidden rounded-md border">
      <div className="border-input bg-muted/40 flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        <ToolbarButton
          icon={Bold}
          label={t("settings.memberOnboardingToolbarBold")}
          onClick={() => wrapText(layout, "**", "**", "bold text")}
        />
        <ToolbarButton
          icon={Italic}
          label={t("settings.memberOnboardingToolbarItalic")}
          onClick={() => wrapText(layout, "*", "*", "italic text")}
        />
        <ToolbarButton
          icon={Code}
          label={t("settings.memberOnboardingToolbarCode")}
          onClick={() => wrapText(layout, "`", "`", "code")}
        />
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <ToolbarButton
          icon={Heading1}
          label={t("settings.memberOnboardingToolbarHeading1")}
          onClick={() => prefixLine(layout, "# ")}
        />
        <ToolbarButton
          icon={Heading2}
          label={t("settings.memberOnboardingToolbarHeading2")}
          onClick={() => prefixLine(layout, "## ")}
        />
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <ToolbarButton
          icon={List}
          label={t("settings.memberOnboardingToolbarBulletList")}
          onClick={() => prefixLine(layout, "- ")}
        />
        <ToolbarButton
          icon={ListOrdered}
          label={t("settings.memberOnboardingToolbarNumberedList")}
          onClick={() => prefixLine(layout, "1. ")}
        />
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("settings.memberOnboardingToolbarLink")}
              title={t("settings.memberOnboardingToolbarLink")}
              tabIndex={-1}
              onClick={() => handleLinkButtonClick(layout)}
            >
              <Link className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  {t("settings.memberOnboardingToolbarLinkText")}
                </p>
                <Input
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder={t("settings.memberOnboardingToolbarLinkText")}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  {t("settings.memberOnboardingToolbarLinkUrl")}
                </p>
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder={t("settings.memberOnboardingToolbarLinkUrl")}
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      insertLink()
                    }
                  }}
                />
              </div>
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={insertLink}>
                  {t("settings.memberOnboardingToolbarInsertLink")}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Textarea
        ref={getTextareaRef(layout)}
        id={`page-markdown-${page.id}-${layout}`}
        rows={14}
        className="min-h-[360px] rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0"
        value={page.markdown}
        onChange={(event) => {
          activeEditorLayoutRef.current = layout
          updatePage(pageIndex, (current) => ({
            ...current,
            markdown: event.target.value,
          }))
        }}
      />
    </div>
  )

  const previewPane = shouldRenderPreview ? (
    <div className="border-input bg-muted/20 overflow-hidden rounded-md border">
      <div className="min-h-[280px] p-4">
        <div className="space-y-6">
          <div className="space-y-1">
            <h3 className="text-2xl font-semibold tracking-tight">
              {page.title || "\u00A0"}
            </h3>
          </div>
          <div className="space-y-2">
            {!markdownPreview ? (
              <p className="text-muted-foreground text-sm">
                {t("settings.memberOnboardingEmptyPreview")}
              </p>
            ) : (
              <div className="space-y-2">{markdownPreview}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null

  return (
    <FieldGroup className="gap-3">
      {/* Page title */}
      <Field>
        <FieldLabel htmlFor={`page-title-${page.id}`}>
          {t("settings.memberOnboardingPageTitle")}
        </FieldLabel>
        <Input
          id={`page-title-${page.id}`}
          value={page.title}
          onChange={(event) => {
            updatePage(pageIndex, (current) => ({
              ...current,
              title: event.target.value,
            }))
          }}
        />
      </Field>

      {/* Markdown editor + preview */}
      <Field>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <FieldLabel
            className="mb-0"
            htmlFor={`page-markdown-${page.id}-${activeLayout}`}
          >
            {t("settings.memberOnboardingPageMarkdown")}
          </FieldLabel>
          {!isDesktop ? (
            <div className="border-input flex overflow-hidden rounded-md border">
              <button
                type="button"
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-colors",
                  activeTab === "editor"
                    ? "bg-muted text-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setActiveTab("editor")}
              >
                {t("settings.memberOnboardingEditorTab")}
              </button>
              <div className="bg-border w-px" />
              <button
                type="button"
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-colors",
                  activeTab === "preview"
                    ? "bg-muted text-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setActiveTab("preview")}
              >
                {t("settings.memberOnboardingPreviewTab")}
              </button>
            </div>
          ) : null}
        </div>

        {isDesktop ? (
          <div className="grid gap-4 md:grid-cols-2 md:items-start">
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs font-medium">
                {t("settings.memberOnboardingEditorTab")}
              </p>
              {renderEditorPane("desktop")}
            </div>
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs font-medium">
                {t("settings.memberOnboardingPreviewTab")}
              </p>
              {previewPane}
            </div>
          </div>
        ) : activeTab === "editor" ? (
          renderEditorPane("mobile")
        ) : (
          previewPane
        )}

        <p className="text-muted-foreground mt-1.5 text-xs">
          {t("settings.memberOnboardingPageMarkdownDescription")}
        </p>
      </Field>
    </FieldGroup>
  )
}

/* -------------------------------------------------------------------------- */
/*  Main Tab Component                                                         */
/* -------------------------------------------------------------------------- */

interface MemberOnboardingSettingsTabProps {
  initialConfig: MemberOnboardingConfigDto
}

interface MemberOnboardingSettingsStoreState {
  values: MemberOnboardingSettingsFormValues
  savedValues: MemberOnboardingSettingsFormValues
  activePageIndex: number
  isSaving: boolean
  isDirty: boolean
  setValues: (
    value:
      | MemberOnboardingSettingsFormValues
      | ((
          current: MemberOnboardingSettingsFormValues,
        ) => MemberOnboardingSettingsFormValues),
  ) => void
  setSavedValues: (savedValues: MemberOnboardingSettingsFormValues) => void
  setActivePageIndex: (activePageIndex: StateUpdater<number>) => void
  setIsSaving: (isSaving: boolean) => void
}

export function MemberOnboardingSettingsTab({
  initialConfig,
}: MemberOnboardingSettingsTabProps) {
  const t = useTranslations()
  const initialValues = mapConfigToFormValues(initialConfig)
  const store = useScopedStore(() =>
    createAppStore<MemberOnboardingSettingsStoreState>((set) => ({
      values: initialValues,
      savedValues: initialValues,
      activePageIndex: 0,
      isSaving: false,
      isDirty: false,
      setValues: (value) =>
        set((state) => {
          const nextValues =
            typeof value === "function" ? value(state.values) : value
          return {
            values: nextValues,
            isDirty: !areMemberOnboardingValuesEqual(
              nextValues,
              state.savedValues,
            ),
          }
        }),
      setSavedValues: (savedValues) =>
        set({
          savedValues,
          isDirty: false,
        }),
      setActivePageIndex: (activePageIndex) =>
        set((state) => ({
          activePageIndex:
            typeof activePageIndex === "function"
              ? activePageIndex(state.activePageIndex)
              : activePageIndex,
        })),
      setIsSaving: (isSaving) => set({ isSaving }),
    })),
  )
  const values = useStore(store, (state) => state.values)
  const savedValues = useStore(store, (state) => state.savedValues)
  const activePageIndex = useStore(store, (state) => state.activePageIndex)
  const isSaving = useStore(store, (state) => state.isSaving)
  const isDirty = useStore(store, (state) => state.isDirty)

  const setValues = useCallback(
    (
      value:
        | MemberOnboardingSettingsFormValues
        | ((
            current: MemberOnboardingSettingsFormValues,
          ) => MemberOnboardingSettingsFormValues),
    ) => {
      store.getState().setValues(value)
    },
    [store],
  )
  useDashboardSettingsTabDirty("memberOnboarding", isDirty)

  const addPage = useCallback(() => {
    setValues((prev) => {
      const newPages = [
        ...prev.pages,
        {
          id: createId(),
          title: `${t("settings.memberOnboardingDefaultPageTitle")} ${prev.pages.length + 1}`,
          markdown: t("settings.memberOnboardingDefaultPageMarkdown"),
        },
      ]
      store.getState().setActivePageIndex(newPages.length - 1)
      return {
        ...prev,
        pages: newPages,
      }
    })
  }, [setValues, store, t])

  const updatePage = useCallback(
    (
      pageIndex: number,
      updater: (
        page: MemberOnboardingPageFormValues,
      ) => MemberOnboardingPageFormValues,
    ) => {
      setValues((prev) => {
        const pages = [...prev.pages]
        const page = pages[pageIndex]
        if (!page) {
          return prev
        }

        pages[pageIndex] = updater(page)
        return {
          ...prev,
          pages,
        }
      })
    },
    [setValues],
  )

  const removePage = useCallback(
    (pageIndex: number) => {
      setValues((prev) => {
        const newPages = prev.pages.filter((_, index) => index !== pageIndex)
        const nextActivePageIndex =
          newPages.length === 0
            ? 0
            : Math.min(
                activePageIndex >= newPages.length
                  ? newPages.length - 1
                  : activePageIndex,
                newPages.length - 1,
              )
        store.getState().setActivePageIndex(nextActivePageIndex)
        return {
          ...prev,
          pages: newPages,
        }
      })
    },
    [activePageIndex, setValues, store],
  )

  const movePage = useCallback(
    (pageIndex: number, direction: "up" | "down") => {
      const targetIndex = direction === "up" ? pageIndex - 1 : pageIndex + 1
      setValues((prev) => ({
        ...prev,
        pages: moveItem(prev.pages, pageIndex, targetIndex),
      }))
      store.getState().setActivePageIndex(targetIndex)
    },
    [setValues, store],
  )

  const handleSave = useCallback(async (): Promise<void> => {
    if (!isDirty) {
      toast.info(t("settings.noChanges"))
      return
    }

    const parsed = memberOnboardingSettingsFormSchema.safeParse(values)
    if (!parsed.success) {
      toast.error(
        translateMaybeMessageKey(t, parsed.error.issues[0]?.message) ??
          t("settings.memberOnboardingSaveFailed"),
      )
      return
    }

    const payload = mapFormValuesToConfig(parsed.data)

    store.getState().setIsSaving(true)
    try {
      const client = getBrowserORPCClient()
      const result = await runApiEffect(
        client.admin.settings.updateMemberOnboarding(payload),
      )
      if (result.error !== null) {
        toast.error(t("settings.memberOnboardingSaveFailed"))
        return
      }

      const nextValues = mapConfigToFormValues(payload)
      store.getState().setValues(nextValues)
      store.getState().setSavedValues(nextValues)
      toast.success(t("settings.memberOnboardingSaved"))
    } finally {
      store.getState().setIsSaving(false)
    }
  }, [isDirty, store, t, values])

  const handleReset = useCallback((): void => {
    store.getState().setValues(savedValues)
    store.getState().setActivePageIndex(0)
  }, [savedValues, store])

  const activePage = values.pages[activePageIndex]

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void handleSave()
      }}
    >
      <FormShell
        title={t("settings.memberOnboardingTitle")}
        description={t("settings.memberOnboardingDescription")}
        actions={
          <>
            <Button
              type="submit"
              disabled={!isDirty || isSaving}
              className="w-full sm:w-auto"
            >
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!isDirty || isSaving}
              onClick={handleReset}
              className="w-full sm:w-auto"
            >
              {t("common.reset")}
            </Button>
          </>
        }
      >
        {/* Enabled toggle */}
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox
              id="member-onboarding-enabled"
              checked={values.enabled}
              onCheckedChange={(checked) => {
                setValues((prev) => ({
                  ...prev,
                  enabled: checked === true,
                }))
              }}
            />
            <div className="grid gap-0.5">
              <FieldLabel
                htmlFor="member-onboarding-enabled"
                className="cursor-pointer font-normal"
              >
                {t("settings.memberOnboardingEnabled")}
              </FieldLabel>
              <p className="text-muted-foreground text-xs">
                {t("settings.memberOnboardingEnabledDescription")}
              </p>
            </div>
          </Field>
        </FieldGroup>

        {/* Page navigation bar */}
        <div className="flex items-center justify-between">
          <h4 className="font-medium">{t("settings.memberOnboardingPages")}</h4>

          <div className="flex items-center gap-0.5">
            {values.pages.length > 1 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    store
                      .getState()
                      .setActivePageIndex((prev) => Math.max(0, prev - 1))
                  }
                  disabled={activePageIndex === 0}
                  aria-label={t("invites.onboardingBack")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-muted-foreground min-w-[3ch] text-center text-xs tabular-nums">
                  {activePageIndex + 1}/{values.pages.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    store
                      .getState()
                      .setActivePageIndex((prev) =>
                        Math.min(values.pages.length - 1, prev + 1),
                      )
                  }
                  disabled={activePageIndex === values.pages.length - 1}
                  aria-label={t("invites.onboardingNext")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>

                <Separator orientation="vertical" className="mx-0.5 h-5" />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => movePage(activePageIndex, "up")}
                  disabled={activePageIndex === 0}
                  aria-label={t("settings.memberOnboardingMoveUp")}
                  title={t("settings.memberOnboardingMoveUp")}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => movePage(activePageIndex, "down")}
                  disabled={activePageIndex === values.pages.length - 1}
                  aria-label={t("settings.memberOnboardingMoveDown")}
                  title={t("settings.memberOnboardingMoveDown")}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>

                <Separator orientation="vertical" className="mx-0.5 h-5" />
              </>
            )}

            {values.pages.length >= 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removePage(activePageIndex)}
                aria-label={t("settings.memberOnboardingDeletePage")}
                title={t("settings.memberOnboardingDeletePage")}
              >
                <Trash2 className="text-destructive h-3.5 w-3.5" />
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={addPage}
              aria-label={t("settings.memberOnboardingAddPage")}
              title={t("settings.memberOnboardingAddPage")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Editor area */}
        {values.pages.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground text-sm">
              {t("settings.memberOnboardingNoPages")}
            </p>
          </div>
        ) : activePage ? (
          <PageEditor
            page={activePage}
            pageIndex={activePageIndex}
            t={t}
            updatePage={updatePage}
          />
        ) : null}
      </FormShell>
    </form>
  )
}
