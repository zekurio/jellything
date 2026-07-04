"use client"

import { FormShell } from "@/components/shared/form-shell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import type { MemberOnboardingConfigDto } from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"

import { PageEditor } from "./onboarding-page-editor"
import { OnboardingPageToolbar } from "./onboarding-page-toolbar"
import { useMemberOnboardingStore } from "./use-member-onboarding-store"

interface MemberOnboardingSettingsTabProps {
  initialConfig: MemberOnboardingConfigDto
}

export function MemberOnboardingSettingsTab({
  initialConfig,
}: MemberOnboardingSettingsTabProps) {
  const t = useTranslations()
  const {
    values,
    activePageIndex,
    isSaving,
    isDirty,
    setValues,
    setActivePageIndex,
    addPage,
    updatePage,
    removePage,
    movePage,
    handleSave,
    handleReset,
  } = useMemberOnboardingStore(initialConfig)

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
        <OnboardingPageToolbar
          t={t}
          activePageIndex={activePageIndex}
          pagesLength={values.pages.length}
          setActivePageIndex={setActivePageIndex}
          movePage={movePage}
          removePage={removePage}
          addPage={addPage}
        />

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
