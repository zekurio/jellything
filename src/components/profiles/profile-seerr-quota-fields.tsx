import { Controller, type Control } from "react-hook-form"

import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useTranslations } from "@/lib/i18n"
import type { ProfileFormValues } from "@/lib/schemas"

import { normalizeQuotaInput, type SeerrQuotaMode } from "./profile-form-utils"

function fieldModeClass(active: boolean): string {
  return active ? "text-foreground" : "text-muted-foreground"
}

function SeerrQuotaSection({
  control,
  id,
  t,
  idKey,
  override,
  mode,
  overrideName,
  modeName,
  limitName,
  daysName,
  overrideLabelKey,
}: {
  control: Control<ProfileFormValues>
  id: string
  t: ReturnType<typeof useTranslations>
  idKey: "movie" | "tv"
  override: boolean
  mode: SeerrQuotaMode
  overrideName: "seerrMovieQuotaOverride" | "seerrTvQuotaOverride"
  modeName: "seerrMovieQuotaMode" | "seerrTvQuotaMode"
  limitName: "seerrMovieQuotaLimit" | "seerrTvQuotaLimit"
  daysName: "seerrMovieQuotaDays" | "seerrTvQuotaDays"
  overrideLabelKey:
    | "profiles.jsrMovieQuotaOverride"
    | "profiles.jsrTvQuotaOverride"
}) {
  return (
    <div>
      <div className="space-y-3">
        <Controller
          name={overrideName}
          control={control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-jsr-${idKey}-quota-override`}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(Boolean(checked))}
              />
              <FieldContent>
                <FieldLabel
                  htmlFor={`${id}-jsr-${idKey}-quota-override`}
                  className="cursor-pointer font-medium"
                >
                  {t(overrideLabelKey)}
                </FieldLabel>
              </FieldContent>
            </Field>
          )}
        />
        {override ? (
          <FieldGroup className="gap-3 border-l-2 pr-2 pl-3">
            <Controller
              name={modeName}
              control={control}
              render={({ field }) => {
                const checked = field.value === "unlimited"

                return (
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel
                        htmlFor={`${id}-jsr-${idKey}-quota-mode`}
                        className={fieldModeClass(checked)}
                      >
                        {t("profiles.jsrQuotaUnlimited")}
                      </FieldLabel>
                      {!checked ? (
                        <FieldDescription>
                          {t("validation.seerrQuotaRange")}
                        </FieldDescription>
                      ) : null}
                    </FieldContent>
                    <Switch
                      id={`${id}-jsr-${idKey}-quota-mode`}
                      checked={checked}
                      onCheckedChange={(nextChecked) =>
                        field.onChange(nextChecked ? "unlimited" : "limited")
                      }
                      className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
                      aria-label={t("profiles.jsrQuotaUnlimited")}
                    />
                  </Field>
                )
              }}
            />
            {mode === "limited" ? (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Controller
                  name={limitName}
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field
                      data-invalid={fieldState.invalid}
                      className="min-w-0"
                    >
                      <FieldLabel
                        htmlFor={`${id}-jsr-${idKey}-limit`}
                        className="text-sm font-medium"
                      >
                        {t("profiles.jsrQuotaRequests")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id={`${id}-jsr-${idKey}-limit`}
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        inputMode="numeric"
                        placeholder="10"
                        aria-invalid={fieldState.invalid}
                        onBlur={(event) => {
                          field.onBlur()
                          field.onChange(
                            normalizeQuotaInput(event.target.value),
                          )
                        }}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  name={daysName}
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field
                      data-invalid={fieldState.invalid}
                      className="min-w-0"
                    >
                      <FieldLabel
                        htmlFor={`${id}-jsr-${idKey}-days`}
                        className="text-sm font-medium"
                      >
                        {t("profiles.jsrQuotaDays")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id={`${id}-jsr-${idKey}-days`}
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        inputMode="numeric"
                        placeholder="30"
                        aria-invalid={fieldState.invalid}
                        onBlur={(event) => {
                          field.onBlur()
                          field.onChange(
                            normalizeQuotaInput(event.target.value),
                          )
                        }}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </div>
            ) : null}
          </FieldGroup>
        ) : null}
      </div>
    </div>
  )
}

export function ProfileSeerrQuotaFields({
  control,
  id,
  t,
  seerrMovieQuotaOverride,
  seerrMovieQuotaMode,
  seerrTvQuotaOverride,
  seerrTvQuotaMode,
}: {
  control: Control<ProfileFormValues>
  id: string
  t: ReturnType<typeof useTranslations>
  seerrMovieQuotaOverride: boolean
  seerrMovieQuotaMode: SeerrQuotaMode
  seerrTvQuotaOverride: boolean
  seerrTvQuotaMode: SeerrQuotaMode
}) {
  return (
    <div className="mt-6 border-t pt-6">
      <h4 className="mb-4 text-sm font-medium">
        {t("profiles.jsrQuotasTitle")}
      </h4>

      <div className="space-y-5">
        <SeerrQuotaSection
          control={control}
          id={id}
          t={t}
          idKey="movie"
          override={seerrMovieQuotaOverride}
          mode={seerrMovieQuotaMode}
          overrideName="seerrMovieQuotaOverride"
          modeName="seerrMovieQuotaMode"
          limitName="seerrMovieQuotaLimit"
          daysName="seerrMovieQuotaDays"
          overrideLabelKey="profiles.jsrMovieQuotaOverride"
        />
        <SeerrQuotaSection
          control={control}
          id={id}
          t={t}
          idKey="tv"
          override={seerrTvQuotaOverride}
          mode={seerrTvQuotaMode}
          overrideName="seerrTvQuotaOverride"
          modeName="seerrTvQuotaMode"
          limitName="seerrTvQuotaLimit"
          daysName="seerrTvQuotaDays"
          overrideLabelKey="profiles.jsrTvQuotaOverride"
        />
      </div>
    </div>
  )
}
