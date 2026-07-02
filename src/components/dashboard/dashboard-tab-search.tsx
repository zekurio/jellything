import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"

type DashboardTabSearchProps = {
  placeholder: string
  value: string
  onChange: (value: string) => void
}

export function DashboardTabSearch({
  placeholder,
  value,
  onChange,
}: DashboardTabSearchProps) {
  return (
    <div className="relative w-full sm:w-80 sm:max-w-80">
      <div className="text-muted-foreground pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Search className="h-4 w-4" />
      </div>
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pl-9"
      />
    </div>
  )
}
