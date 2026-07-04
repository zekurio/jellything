import { Controller, type Control } from "react-hook-form"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { useTranslations } from "@/lib/i18n"
import type { ProfileFormValues } from "@/lib/schemas"
import {
  DEFAULT_SEERR_PERMISSIONS,
  SEERR_PERMISSION_TREE,
  type SeerrPermissionOption,
} from "@/lib/seerr-permissions"

import { hasSeerrPermission, requirementsMet } from "./profile-form-utils"

export function ProfileSeerrPermissionFields({
  control,
  id,
  t,
  mediaServerName,
}: {
  control: Control<ProfileFormValues>
  id: string
  t: ReturnType<typeof useTranslations>
  mediaServerName: string
}) {
  return (
    <Controller
      name="seerrPermissions"
      control={control}
      render={({ field }) => {
        const currentValue =
          typeof field.value === "number"
            ? field.value
            : DEFAULT_SEERR_PERMISSIONS

        function toggle(value: number, checked: boolean): void {
          const next = checked ? currentValue | value : currentValue & ~value
          field.onChange(next)
        }

        function toggleParent(
          option: SeerrPermissionOption,
          checked: boolean,
        ): void {
          let next = checked
            ? currentValue | option.value
            : currentValue & ~option.value

          if (option.children) {
            for (const child of option.children) {
              next = checked ? next | child.value : next & ~child.value
            }
          }

          field.onChange(next)
        }

        function renderOption(
          option: SeerrPermissionOption,
          parentChecked?: boolean,
        ): React.ReactNode {
          const meetsRequirements = requirementsMet(
            option.requires,
            currentValue,
          )
          const autoGranted = (option.autoGrantedBy ?? []).some((permission) =>
            hasSeerrPermission(permission, currentValue),
          )
          const isChecked = hasSeerrPermission(option.value, currentValue)
          const isDisabled =
            parentChecked === true || autoGranted || !meetsRequirements
          const isVisibleChecked =
            (isChecked && meetsRequirements) ||
            parentChecked === true ||
            autoGranted
          const label =
            option.key === "watchlistView"
              ? t(option.labelKey, { mediaServerName })
              : t(option.labelKey)
          return (
            <div key={option.key}>
              <Field orientation="horizontal">
                <Checkbox
                  id={`${id}-jsr-${option.key}`}
                  checked={isVisibleChecked}
                  disabled={isDisabled}
                  onCheckedChange={(c) => {
                    const on = Boolean(c)
                    if (option.children) {
                      toggleParent(option, on)
                      return
                    }
                    toggle(option.value, on)
                  }}
                />
                <div>
                  <FieldLabel
                    htmlFor={`${id}-jsr-${option.key}`}
                    className="cursor-pointer font-medium"
                  >
                    {label}
                  </FieldLabel>
                </div>
              </Field>
              {option.children && (
                <div className="mt-2 ml-2 space-y-3 border-l-2 pl-4">
                  {option.children.map((child) =>
                    renderOption(child, isChecked),
                  )}
                </div>
              )}
            </div>
          )
        }

        return (
          <div className="space-y-4">
            {SEERR_PERMISSION_TREE.map((option) => renderOption(option))}
          </div>
        )
      }}
    />
  )
}
