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
import type { MediaLibraryDto } from "@/lib/api/contracts/admin"
import { useTranslations } from "@/lib/i18n"
import type { ProfileFormValues } from "@/lib/schemas"

export function ProfileGeneralFields({
  control,
  id,
  t,
  libraries,
  enableAllFolders,
}: {
  control: Control<ProfileFormValues>
  id: string
  t: ReturnType<typeof useTranslations>
  libraries: MediaLibraryDto[]
  enableAllFolders: boolean
}) {
  return (
    <FieldGroup className="gap-6">
      <Controller
        name="name"
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-profile-name`}>
              {t("profiles.profileNameLabel")}
            </FieldLabel>
            <Input
              {...field}
              id={`${id}-profile-name`}
              aria-invalid={fieldState.invalid}
              placeholder={t("profiles.profileNamePlaceholder")}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <FieldSet>
        <div className="mb-2">
          <h3 className="text-base font-medium">
            {t("profiles.libraryAccess")}
          </h3>
        </div>
        <FieldGroup data-slot="checkbox-group">
          <Controller
            name="enableAllFolders"
            control={control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id={`${id}-profile-all-folders`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <div>
                  <FieldLabel
                    htmlFor={`${id}-profile-all-folders`}
                    className="cursor-pointer font-normal"
                  >
                    {t("profiles.accessAllLibraries")}
                  </FieldLabel>
                </div>
              </Field>
            )}
          />

          {!enableAllFolders && (
            <Controller
              name="enabledFolders"
              control={control}
              render={({ field }) => (
                <div className="ml-1 space-y-2 border-l-2 pl-4">
                  {libraries.map((library) => (
                    <Field key={library.id} orientation="horizontal">
                      <Checkbox
                        id={`${id}-profile-lib-${library.id}`}
                        checked={field.value.includes(library.id)}
                        onCheckedChange={(checked) => {
                          const newValue = checked
                            ? [...field.value, library.id]
                            : field.value.filter(
                                (folderId) => folderId !== library.id,
                              )
                          field.onChange(newValue)
                        }}
                      />
                      <FieldLabel
                        htmlFor={`${id}-profile-lib-${library.id}`}
                        className="cursor-pointer font-normal"
                      >
                        {library.name}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              )}
            />
          )}
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <h3 className="mb-1 text-base font-medium">
          {t("profiles.loginVisibility")}
        </h3>
        <FieldGroup data-slot="checkbox-group">
          <Controller
            name="showInLoginScreen"
            control={control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id={`${id}-profile-show-in-login`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <div>
                  <FieldLabel
                    htmlFor={`${id}-profile-show-in-login`}
                    className="cursor-pointer font-normal"
                  >
                    {t("profiles.showInLoginScreen")}
                  </FieldLabel>
                </div>
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>
    </FieldGroup>
  )
}
