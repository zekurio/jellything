import { Controller, type Control } from "react-hook-form"

import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useTranslations } from "@/lib/i18n"
import type { ProfileFormValues } from "@/lib/schemas"

export function ProfileStreamingFields({
  control,
  id,
  t,
}: {
  control: Control<ProfileFormValues>
  id: string
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <FieldGroup className="gap-6">
      <FieldSet>
        <div className="mb-2">
          <h3 className="text-base font-medium">
            {t("profiles.transcodingOptions")}
          </h3>
        </div>
        <FieldGroup data-slot="checkbox-group">
          <Controller
            name="allowVideoTranscoding"
            control={control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id={`${id}-profile-video-transcoding`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <div>
                  <FieldLabel
                    htmlFor={`${id}-profile-video-transcoding`}
                    className="cursor-pointer font-normal"
                  >
                    {t("profiles.allowVideoTranscoding")}
                  </FieldLabel>
                </div>
              </Field>
            )}
          />
          <Controller
            name="allowAudioTranscoding"
            control={control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id={`${id}-profile-audio-transcoding`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <div>
                  <FieldLabel
                    htmlFor={`${id}-profile-audio-transcoding`}
                    className="cursor-pointer font-normal"
                  >
                    {t("profiles.allowAudioTranscoding")}
                  </FieldLabel>
                </div>
              </Field>
            )}
          />
          <Controller
            name="allowMediaRemuxing"
            control={control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id={`${id}-profile-remuxing`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <div>
                  <FieldLabel
                    htmlFor={`${id}-profile-remuxing`}
                    className="cursor-pointer font-normal"
                  >
                    {t("profiles.allowRemuxing")}
                  </FieldLabel>
                </div>
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>

      <Controller
        name="bitrateMbps"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-profile-bitrate`}>
              {t("profiles.remoteBitrate")}
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                {...field}
                id={`${id}-profile-bitrate`}
                type="number"
                aria-invalid={fieldState.invalid}
                placeholder="0"
                min={0}
                step={1}
                className="w-20"
              />
              <span className="text-muted-foreground text-sm">
                {t("profiles.bitrateHelp")}
              </span>
            </div>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    </FieldGroup>
  )
}
