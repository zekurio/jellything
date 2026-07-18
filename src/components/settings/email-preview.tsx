"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  EMAIL_MESSAGE_TYPES,
  type EmailBrandingDraft,
  type EmailMessageType,
} from "@/lib/email"
import { useTranslations } from "@/lib/i18n"
import { getBrowserORPCClient, runApiEffect } from "@/lib/orpc/client"

interface EmailPreviewSectionProps {
  branding: EmailBrandingDraft
  emailConfigured: boolean
}

export function EmailPreviewSection({
  branding,
  emailConfigured,
}: EmailPreviewSectionProps) {
  const t = useTranslations()
  const [selectedType, setSelectedType] =
    useState<EmailMessageType>("verifyEmail")
  const [preview, setPreview] = useState<{
    subject: string
    html: string
  } | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [testRecipient, setTestRecipient] = useState("")
  const [isSendingTest, setIsSendingTest] = useState(false)

  async function handlePreview(): Promise<void> {
    setIsPreviewing(true)
    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.admin.settings.previewEmail({
        messageType: selectedType,
        branding,
      }),
    )
    setIsPreviewing(false)

    if (result.error !== null || !result.data) {
      toast.error(t("settings.emailPreviewFailed"))
      return
    }

    setPreview(result.data)
  }

  async function handleSendTest(): Promise<void> {
    setIsSendingTest(true)
    const client = getBrowserORPCClient()
    const result = await runApiEffect(
      client.admin.settings.sendTestEmail({
        messageType: selectedType,
        branding,
        recipient: testRecipient.trim(),
      }),
    )
    setIsSendingTest(false)

    if (result.error !== null) {
      toast.error(t("settings.emailTestFailed"))
      return
    }

    toast.success(t("settings.emailTestSent"))
  }

  return (
    <>
      <div>
        <h3 className="text-sm font-medium">
          {t("settings.emailPreviewTitle")}
        </h3>
        <p className="text-muted-foreground text-xs">
          {t("settings.emailPreviewDescription")}
        </p>
      </div>

      <Field>
        <FieldLabel htmlFor="emailMessageType">
          {t("settings.emailMessageType")}
        </FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={selectedType}
            onValueChange={(value) =>
              setSelectedType(value as EmailMessageType)
            }
          >
            <SelectTrigger id="emailMessageType" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_MESSAGE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`settings.emailMessageTypes.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={isPreviewing}
            onClick={handlePreview}
            className="w-full sm:w-auto"
          >
            {t("settings.emailPreview")}
          </Button>
        </div>
      </Field>

      <Field>
        <FieldLabel htmlFor="emailTestRecipient">
          {t("settings.emailTestRecipient")}
        </FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="emailTestRecipient"
            type="email"
            placeholder={t("settings.emailTestRecipientPlaceholder")}
            value={testRecipient}
            onChange={(event) => setTestRecipient(event.target.value)}
            className="w-full sm:w-72"
          />
          <Button
            type="button"
            variant="outline"
            disabled={
              !emailConfigured || !testRecipient.trim() || isSendingTest
            }
            onClick={handleSendTest}
            className="w-full sm:w-auto"
          >
            {t("settings.emailTestSend")}
          </Button>
        </div>
        {!emailConfigured && (
          <p className="text-muted-foreground text-xs">
            {t("settings.emailTestRequiresSaved")}
          </p>
        )}
      </Field>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPreview(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.subject}</DialogTitle>
          </DialogHeader>
          <iframe
            title={t("settings.emailPreview")}
            sandbox=""
            srcDoc={preview?.html ?? ""}
            className="h-[65vh] w-full rounded-md border bg-white"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
