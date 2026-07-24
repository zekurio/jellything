"use client"

import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link,
  List,
  ListOrdered,
} from "lucide-react"
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { PlaceholderChips } from "@/components/settings/placeholder-chips"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useTranslations } from "@/lib/i18n"
import { renderMarkdown } from "@/lib/markdown"
import {
  ONBOARDING_PLACEHOLDERS,
  interpolatePlaceholders,
  type PlaceholderValues,
} from "@/lib/placeholders"
import type { MemberOnboardingPageFormValues } from "@/lib/schemas"
import { cn } from "@/lib/utils"

import { applyLinePrefix } from "./member-onboarding-utils"

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

export function PageEditor({
  page,
  pageIndex,
  placeholderValues,
  t,
  updatePage,
}: {
  page: MemberOnboardingPageFormValues
  pageIndex: number
  placeholderValues: PlaceholderValues
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
    () =>
      shouldRenderPreview
        ? renderMarkdown(
            interpolatePlaceholders(deferredMarkdown, placeholderValues),
          )
        : null,
    [deferredMarkdown, placeholderValues, shouldRenderPreview],
  )
  const titlePreview = interpolatePlaceholders(page.title, placeholderValues)

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

  const insertPlaceholderToken = useCallback(
    (layout: "mobile" | "desktop", token: string) => {
      const textarea = getTextareaRef(layout).current
      if (!textarea) return

      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue =
        textarea.value.slice(0, start) + token + textarea.value.slice(end)

      updatePage(pageIndex, (current) => ({ ...current, markdown: newValue }))

      requestAnimationFrame(() => {
        textarea.focus()
        const cursor = start + token.length
        textarea.setSelectionRange(cursor, cursor)
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

      <div className="border-input bg-muted/40 border-t px-2 py-1.5">
        <PlaceholderChips
          placeholderKeys={ONBOARDING_PLACEHOLDERS}
          onInsert={(token) => insertPlaceholderToken(layout, token)}
        />
      </div>
    </div>
  )

  const previewPane = shouldRenderPreview ? (
    <div className="border-input bg-muted/20 overflow-hidden rounded-md border">
      <div className="min-h-[280px] p-4">
        <div className="space-y-6">
          <div className="space-y-1">
            <h3 className="text-2xl font-semibold tracking-tight">
              {titlePreview || "\u00A0"}
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
