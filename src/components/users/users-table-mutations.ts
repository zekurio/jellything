import type {
  BulkManagedUserResultDto,
  ManagedUserListItemDto,
  UpdateManagedUserDto,
} from "@/lib/api/contracts/admin"

export type UserListUpdater = (
  users: ManagedUserListItemDto[],
) => ManagedUserListItemDto[]

export type BulkOperationSuccessResult = Extract<
  BulkManagedUserResultDto,
  { ok: true }
>

export function isBulkOperationSuccessResult(
  result: BulkManagedUserResultDto,
): result is BulkOperationSuccessResult {
  return result.ok && !("skipped" in result)
}

function patchUserFromUpdateResult(
  user: ManagedUserListItemDto,
  result: UpdateManagedUserDto,
): ManagedUserListItemDto {
  return {
    ...user,
    assignedProfileId: user.isAdmin ? null : result.profileId,
    effectiveProfileId: user.isAdmin ? null : result.profileId,
    effectiveProfileName: user.isAdmin ? null : result.profileName,
    email: result.email,
    emailVerified: result.emailVerified,
    isDisabled: result.isDisabled,
    expiresAt: result.expiresAt,
  }
}

export function applyUserUpdateResult(
  users: ManagedUserListItemDto[],
  result: UpdateManagedUserDto,
): ManagedUserListItemDto[] {
  return users.map((user) =>
    user.userId === result.userId
      ? patchUserFromUpdateResult(user, result)
      : user,
  )
}

export function patchUserById(
  users: ManagedUserListItemDto[],
  userId: string,
  patch: Partial<ManagedUserListItemDto>,
): ManagedUserListItemDto[] {
  return users.map((user) =>
    user.userId === userId ? { ...user, ...patch } : user,
  )
}

export function removeUserById(
  users: ManagedUserListItemDto[],
  userId: string,
): ManagedUserListItemDto[] {
  return users.filter((user) => user.userId !== userId)
}
