import type { ErrorCode } from "@/lib/api/contracts/errors"

export function toErrorCode(code: string): ErrorCode {
  return code.toUpperCase() as ErrorCode
}
