import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import WeeklyCountGrid from "./WeeklyCountGrid"

export default function WeeklyCountPage() {
  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center gap-4">
        <Select defaultValue="HVAC">
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select division" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="HVAC">HVAC</SelectItem>
            <SelectItem value="SprayFoam">Spray Foam</SelectItem>
          </SelectContent>
        </Select>

        <div className="text-sm text-muted-foreground">
          Snapshot: Today
        </div>

        <Button>Save Snapshot</Button>
      </header>

      <main>
        <WeeklyCountGrid />
      </main>
    </div>
  )
}
