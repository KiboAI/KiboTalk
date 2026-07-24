import { Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * Toast outlet. Themed via CSS variables so it follows the paper shell in
 * both light and dark (sonner reads these vars when theme="system").
 */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
export { toast } from 'sonner'
