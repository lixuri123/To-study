import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "ghost" | "outline" | "danger";
  }
>(({ className, variant = "primary", ...props }, ref) => (
  <button
    ref={ref}
    className={cn("button", `button-${variant}`, className)}
    {...props}
  />
));
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("input", className)} {...props} />
));
export type Confirmation = {
  title: string;
  description: string;
  label: string;
  action: () => void | Promise<void>;
  cancelLabel?: string;
  secondaryLabel?: string;
  secondaryAction?: () => void;
  variant?: "primary" | "danger";
};
export function Confirm({
  value,
  onClose,
}: {
  value: Confirmation | null;
  onClose: () => void;
}) {
  return (
    <AlertDialog.Root
      open={!!value}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <span className="eyebrow">请再确认一下</span>
          <AlertDialog.Title>{value?.title}</AlertDialog.Title>
          <AlertDialog.Description>
            {value?.description}
          </AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">
                {value?.cancelLabel ?? (value?.label === "放弃修改" ? "继续编辑" : "取消")}
              </Button>
            </AlertDialog.Cancel>
            {value?.secondaryLabel&&(<AlertDialog.Action asChild>
              <Button variant="danger" onClick={() => value.secondaryAction?.()}>
                {value.secondaryLabel}
              </Button>
            </AlertDialog.Action>)}
            <AlertDialog.Action asChild>
              <Button variant={value?.variant ?? "danger"} onClick={() => void value?.action()}>
                {value?.label}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
