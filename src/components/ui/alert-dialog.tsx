// src/components/ui/alert-dialog.tsx
"use client"

import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

const AlertDialog = AlertDialogPrimitive.Root
const AlertDialogTrigger = AlertDialogPrimitive.Trigger
const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef(function AlertDialogOverlay(
  props: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay> & { className?: string },
  ref: React.ForwardedRef<HTMLDivElement>
) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        props.className
      )}
      {...props}
      ref={ref}
    />
  )
})

const AlertDialogContent = React.forwardRef(function AlertDialogContent(
  props: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> & { className?: string },
  ref: React.ForwardedRef<HTMLDivElement>
) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          props.className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
})

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
    {...props}
  />
)

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
)

const AlertDialogTitle = React.forwardRef(function AlertDialogTitle(
  props: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title> & { className?: string },
  ref: React.ForwardedRef<HTMLHeadingElement>
) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn("text-lg font-semibold", props.className)}
      {...props}
    />
  )
})

const AlertDialogDescription = React.forwardRef(function AlertDialogDescription(
  props: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description> & { className?: string },
  ref: React.ForwardedRef<HTMLParagraphElement>
) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", props.className)}
      {...props}
    />
  )
})

const AlertDialogAction = React.forwardRef(function AlertDialogAction(
  props: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> & { className?: string },
  ref: React.ForwardedRef<HTMLButtonElement>
) {
  return (
    <AlertDialogPrimitive.Action
      ref={ref}
      className={cn(buttonVariants(), props.className)}
      {...props}
    />
  )
})

const AlertDialogCancel = React.forwardRef(function AlertDialogCancel(
  props: React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel> & { className?: string },
  ref: React.ForwardedRef<HTMLButtonElement>
) {
  return (
    <AlertDialogPrimitive.Cancel
      ref={ref}
      className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", props.className)}
      {...props}
    />
  )
})

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
