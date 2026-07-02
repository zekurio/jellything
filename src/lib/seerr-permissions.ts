import type { MessageKey } from "@/lib/i18n"

export enum SeerrPermission {
  NONE = 0,
  ADMIN = 2,
  MANAGE_SETTINGS = 4,
  MANAGE_USERS = 8,
  MANAGE_REQUESTS = 16,
  REQUEST = 32,
  VOTE = 64,
  AUTO_APPROVE = 128,
  AUTO_APPROVE_MOVIE = 256,
  AUTO_APPROVE_TV = 512,
  REQUEST_4K = 1024,
  REQUEST_4K_MOVIE = 2048,
  REQUEST_4K_TV = 4096,
  REQUEST_ADVANCED = 8192,
  REQUEST_VIEW = 16384,
  AUTO_APPROVE_4K = 32768,
  AUTO_APPROVE_4K_MOVIE = 65536,
  AUTO_APPROVE_4K_TV = 131072,
  REQUEST_MOVIE = 262144,
  REQUEST_TV = 524288,
  MANAGE_ISSUES = 1048576,
  VIEW_ISSUES = 2097152,
  CREATE_ISSUES = 4194304,
  AUTO_REQUEST = 8388608,
  AUTO_REQUEST_MOVIE = 16777216,
  AUTO_REQUEST_TV = 33554432,
  RECENT_VIEW = 67108864,
  WATCHLIST_VIEW = 134217728,
  MANAGE_BLOCKLIST = 268435456,
  VIEW_BLOCKLIST = 1073741824,
}

export const DEFAULT_SEERR_PERMISSIONS = SeerrPermission.REQUEST

export const ALL_SEERR_PERMISSIONS = Object.values(SeerrPermission)
  .filter((value): value is number => typeof value === "number")
  .reduce((combined, value) => combined | value, 0)

export interface SeerrPermissionRequirement {
  permissions: SeerrPermission[]
  type?: "and" | "or"
}

export interface SeerrPermissionOption {
  key: string
  labelKey: MessageKey
  descriptionKey: MessageKey
  value: SeerrPermission
  children?: SeerrPermissionOption[]
  requires?: SeerrPermissionRequirement[]
  autoGrantedBy?: SeerrPermission[]
}

export const SEERR_AUTO_APPROVE_PERMISSIONS = [
  SeerrPermission.AUTO_APPROVE,
  SeerrPermission.AUTO_APPROVE_MOVIE,
  SeerrPermission.AUTO_APPROVE_TV,
  SeerrPermission.AUTO_APPROVE_4K,
  SeerrPermission.AUTO_APPROVE_4K_MOVIE,
  SeerrPermission.AUTO_APPROVE_4K_TV,
] as const

export const SEERR_PERMISSION_TREE: SeerrPermissionOption[] = [
  {
    key: "admin",
    labelKey: "profiles.jsrAdmin",
    descriptionKey: "profiles.jsrAdminDesc",
    value: SeerrPermission.ADMIN,
  },
  {
    key: "manageUsers",
    labelKey: "profiles.jsrManageUsers",
    descriptionKey: "profiles.jsrManageUsersDesc",
    value: SeerrPermission.MANAGE_USERS,
  },
  {
    key: "manageRequests",
    labelKey: "profiles.jsrManageRequests",
    descriptionKey: "profiles.jsrManageRequestsDesc",
    value: SeerrPermission.MANAGE_REQUESTS,
    children: [
      {
        key: "requestAdvanced",
        labelKey: "profiles.jsrRequestAdvanced",
        descriptionKey: "profiles.jsrRequestAdvancedDesc",
        value: SeerrPermission.REQUEST_ADVANCED,
      },
      {
        key: "requestView",
        labelKey: "profiles.jsrRequestView",
        descriptionKey: "profiles.jsrRequestViewDesc",
        value: SeerrPermission.REQUEST_VIEW,
      },
      {
        key: "recentView",
        labelKey: "profiles.jsrRecentView",
        descriptionKey: "profiles.jsrRecentViewDesc",
        value: SeerrPermission.RECENT_VIEW,
      },
      {
        key: "watchlistView",
        labelKey: "profiles.jsrWatchlistView",
        descriptionKey: "profiles.jsrWatchlistViewDesc",
        value: SeerrPermission.WATCHLIST_VIEW,
      },
    ],
  },
  {
    key: "request",
    labelKey: "profiles.jsrRequest",
    descriptionKey: "profiles.jsrRequestDesc",
    value: SeerrPermission.REQUEST,
    children: [
      {
        key: "requestMovie",
        labelKey: "profiles.jsrRequestMovie",
        descriptionKey: "profiles.jsrRequestMovieDesc",
        value: SeerrPermission.REQUEST_MOVIE,
      },
      {
        key: "requestTv",
        labelKey: "profiles.jsrRequestTv",
        descriptionKey: "profiles.jsrRequestTvDesc",
        value: SeerrPermission.REQUEST_TV,
      },
    ],
  },
  {
    key: "autoApprove",
    labelKey: "profiles.jsrAutoApprove",
    descriptionKey: "profiles.jsrAutoApproveDesc",
    value: SeerrPermission.AUTO_APPROVE,
    requires: [{ permissions: [SeerrPermission.REQUEST] }],
    autoGrantedBy: [SeerrPermission.MANAGE_REQUESTS],
    children: [
      {
        key: "autoApproveMovie",
        labelKey: "profiles.jsrAutoApproveMovie",
        descriptionKey: "profiles.jsrAutoApproveMovieDesc",
        value: SeerrPermission.AUTO_APPROVE_MOVIE,
        requires: [
          {
            permissions: [
              SeerrPermission.REQUEST,
              SeerrPermission.REQUEST_MOVIE,
            ],
            type: "or",
          },
        ],
        autoGrantedBy: [SeerrPermission.MANAGE_REQUESTS],
      },
      {
        key: "autoApproveTv",
        labelKey: "profiles.jsrAutoApproveTv",
        descriptionKey: "profiles.jsrAutoApproveTvDesc",
        value: SeerrPermission.AUTO_APPROVE_TV,
        requires: [
          {
            permissions: [SeerrPermission.REQUEST, SeerrPermission.REQUEST_TV],
            type: "or",
          },
        ],
        autoGrantedBy: [SeerrPermission.MANAGE_REQUESTS],
      },
    ],
  },
  {
    key: "autoRequest",
    labelKey: "profiles.jsrAutoRequest",
    descriptionKey: "profiles.jsrAutoRequestDesc",
    value: SeerrPermission.AUTO_REQUEST,
    requires: [{ permissions: [SeerrPermission.REQUEST] }],
    children: [
      {
        key: "autoRequestMovie",
        labelKey: "profiles.jsrAutoRequestMovie",
        descriptionKey: "profiles.jsrAutoRequestMovieDesc",
        value: SeerrPermission.AUTO_REQUEST_MOVIE,
        requires: [
          {
            permissions: [
              SeerrPermission.REQUEST,
              SeerrPermission.REQUEST_MOVIE,
            ],
            type: "or",
          },
        ],
      },
      {
        key: "autoRequestTv",
        labelKey: "profiles.jsrAutoRequestTv",
        descriptionKey: "profiles.jsrAutoRequestTvDesc",
        value: SeerrPermission.AUTO_REQUEST_TV,
        requires: [
          {
            permissions: [SeerrPermission.REQUEST, SeerrPermission.REQUEST_TV],
            type: "or",
          },
        ],
      },
    ],
  },
  {
    key: "request4k",
    labelKey: "profiles.jsrRequest4k",
    descriptionKey: "profiles.jsrRequest4kDesc",
    value: SeerrPermission.REQUEST_4K,
    children: [
      {
        key: "request4kMovie",
        labelKey: "profiles.jsrRequest4kMovie",
        descriptionKey: "profiles.jsrRequest4kMovieDesc",
        value: SeerrPermission.REQUEST_4K_MOVIE,
      },
      {
        key: "request4kTv",
        labelKey: "profiles.jsrRequest4kTv",
        descriptionKey: "profiles.jsrRequest4kTvDesc",
        value: SeerrPermission.REQUEST_4K_TV,
      },
    ],
  },
  {
    key: "autoApprove4k",
    labelKey: "profiles.jsrAutoApprove4k",
    descriptionKey: "profiles.jsrAutoApprove4kDesc",
    value: SeerrPermission.AUTO_APPROVE_4K,
    requires: [{ permissions: [SeerrPermission.REQUEST_4K] }],
    autoGrantedBy: [SeerrPermission.MANAGE_REQUESTS],
    children: [
      {
        key: "autoApprove4kMovie",
        labelKey: "profiles.jsrAutoApprove4kMovie",
        descriptionKey: "profiles.jsrAutoApprove4kMovieDesc",
        value: SeerrPermission.AUTO_APPROVE_4K_MOVIE,
        requires: [
          {
            permissions: [
              SeerrPermission.REQUEST_4K,
              SeerrPermission.REQUEST_4K_MOVIE,
            ],
            type: "or",
          },
        ],
        autoGrantedBy: [SeerrPermission.MANAGE_REQUESTS],
      },
      {
        key: "autoApprove4kTv",
        labelKey: "profiles.jsrAutoApprove4kTv",
        descriptionKey: "profiles.jsrAutoApprove4kTvDesc",
        value: SeerrPermission.AUTO_APPROVE_4K_TV,
        requires: [
          {
            permissions: [
              SeerrPermission.REQUEST_4K,
              SeerrPermission.REQUEST_4K_TV,
            ],
            type: "or",
          },
        ],
        autoGrantedBy: [SeerrPermission.MANAGE_REQUESTS],
      },
    ],
  },
  {
    key: "manageIssues",
    labelKey: "profiles.jsrManageIssues",
    descriptionKey: "profiles.jsrManageIssuesDesc",
    value: SeerrPermission.MANAGE_ISSUES,
    children: [
      {
        key: "createIssues",
        labelKey: "profiles.jsrCreateIssues",
        descriptionKey: "profiles.jsrCreateIssuesDesc",
        value: SeerrPermission.CREATE_ISSUES,
      },
      {
        key: "viewIssues",
        labelKey: "profiles.jsrViewIssues",
        descriptionKey: "profiles.jsrViewIssuesDesc",
        value: SeerrPermission.VIEW_ISSUES,
      },
    ],
  },
  {
    key: "manageBlocklist",
    labelKey: "profiles.jsrManageBlocklist",
    descriptionKey: "profiles.jsrManageBlocklistDesc",
    value: SeerrPermission.MANAGE_BLOCKLIST,
    children: [
      {
        key: "viewBlocklist",
        labelKey: "profiles.jsrViewBlocklist",
        descriptionKey: "profiles.jsrViewBlocklistDesc",
        value: SeerrPermission.VIEW_BLOCKLIST,
      },
    ],
  },
]

export function getChildValues(
  option: SeerrPermissionOption,
): SeerrPermission[] {
  if (!option.children) {
    return []
  }
  return option.children.map((child) => child.value)
}
