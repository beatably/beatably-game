import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // ShadCN-style Switch: track height now matches the white thumb (h-5) for the requested look.
      // Prevent global button min-height/padding from inflating the control on small screens by forcing min-h/min-w overrides.
      // Unchecked: neutral input surface; Checked: primary green. Small inner padding keeps the thumb inset.
      // Track radius set to match thumb radius for closer iOS look.
      "peer inline-flex h-7 w-12 min-h-0 min-w-0 shrink-0 cursor-pointer items-center rounded-[14px] bg-input p-1 border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=unchecked]:bg-[#1a1a1a]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // Classic white thumb with subtle shadow and a translate that matches the track width.
        "pointer-events-none block h-5 w-5 rounded-full bg-foreground shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
