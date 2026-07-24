import * as React from 'react'
import * as TogglePrimitive from '@radix-ui/react-toggle'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

/**
 * The "selectable token" surface — resting = track tint, on = surface-active
 * + tier1 shadow. Shared by ToggleGroup (chip row / segmented control) and
 * any standalone Toggle.
 */
const toggleVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold text-foreground/70 transition-[filter] disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-surface-active data-[state=on]:text-primary-foreground data-[state=on]:shadow-tier1',
  {
    variants: {
      variant: {
        default: 'bg-foreground/6',
        chip: 'flex-1 bg-foreground/6 px-0 py-2.5',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive.Root ref={ref} className={cn(toggleVariants({ variant, size, className }))} {...props} />
))
Toggle.displayName = TogglePrimitive.Root.displayName

export { Toggle, toggleVariants }
