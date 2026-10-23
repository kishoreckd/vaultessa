import * as React from "react"
import { cn } from "cn"
import { fieldStyles } from "./field-styles"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldStyles,
        "flex field-sizing-content min-h-16 w-full px-2.5 py-2 text-base md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
