import * as React from "react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

function SurfaceCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn(
        "rounded-[28px] border border-white/70 bg-white/90 shadow-[0_24px_60px_rgba(15,34,52,0.12)] backdrop-blur-sm",
        className
      )}
      {...props}
    />
  )
}

export { SurfaceCard }
